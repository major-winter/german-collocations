#!/usr/bin/env python3
"""
Extract verb subject/object arguments from the Leipzig sentences.txt corpus
using spaCy's dependency parse: for a given verb, which nouns genuinely act
as its grammatical subject, accusative object, dative object, or genitive
object - as opposed to whatever noun happens to sit next to it in the
sentence (lemma_collocations' plain adjacency, decision #44).

This script is intentionally standalone (same spirit as tag_words.py /
extract_verb_prepositions.py): it runs once, on a laptop, and produces TSVs
that get shipped to the VM the same way the raw Leipzig files are. It is
never containerized and never part of the deploy path.

Usage:
    python extract_verb_arguments.py --input ../../data/sentences.txt \
        --output verb_argument.tsv --examples-output verb_argument_examples.tsv

Input format (tab-separated, per Leipzig's sentences.txt):
    <id>\t<sentence text>

Output formats (tab-separated):
    verb_argument.tsv:          <verb_lemma>\t<relation>\t<argument_lemma>\t<count>
    verb_argument_examples.tsv: <verb_lemma>\t<relation>\t<argument_lemma>\t<sentence>\t<verb_surface>\t<argument_surface>

<relation> is one of Subjekt/Akkusativobjekt/Dativobjekt/Genitivobjekt.

Why the dependency parse, not plain adjacency: subjects and objects in
German routinely sit far from their verb - subordinate clauses are
verb-final ("..., dass Bianca ... ein Haus kaufte"), main clauses front
arbitrary constituents before the verb ("Ab 1963 kaufte die BRD ...
Gefangene frei"), and passive/modal/perfect constructions stack an
auxiliary or modal between the content verb and its arguments. A
dependency parse attaches sb/oa/da/og directly to the verb token
(TIGER/Negra scheme, spaCy's de_core_news_* label set) regardless of
linear distance, the same property decision #52 relied on for governed
prepositions.

Passive voice needed real hand-verification, not an assumption (12 real
sentences checked, covering active SVO, fronted subject, subordinate
verb-final, reflexive, perfect tense, modal stacking, simple passive,
agentive passive, subjectless dative passive, and future tense - see
docs/decisions.md):

- A participle (VerbForm=Part) never carries its own "sb" child, whether
  perfect ("hat ... gekauft") or passive ("wurde ... gekauft") - the
  subject always attaches to the finite verb/aux/modal instead. Finding
  it requires walking up through however many aux/modal layers stack
  (`dep_ == "oc"` chains) until a token with a direct "sb" child appears -
  confirmed necessary by a genuine 3-level case ("Neuwagen ... verkauft
  werden dürfen": sb sits on "dürfen", two hops above the participle).
- Distinguishing passive ("werden" + Partizip II) from perfect ("haben" +
  Partizip II) or future/modal ("werden"/modal + Infinitiv) matters
  because passive promotes the accusative object to nominative subject
  position - German only ever promotes the accusative object (confirmed:
  "Allen wird geholfen" / "Uns wurde geholfen" leave the dative object
  in place on the participle and are subjectless, no promoted "sb" at
  all). So a subject found by walking up from a genuine
  werden+Partizip-II chain is attributed back as the participle's
  Akkusativobjekt, not its Subjekt. The VerbForm feature (Part vs Inf)
  on the embedded verb is what disambiguates "werden" as a passive
  auxiliary from "werden" as the future auxiliary (confirmed: "werden
  Sie ... Brillen verkaufen" keeps "verkaufen" as a plain Infinitiv with
  its own local "oa" child ("Brillen") and an unpromoted subject on
  "werden" - ordinary active future tense, not passive).
- "sein" + Partizip II is genuinely ambiguous from the parse alone
  (Perfekt for a small class of intransitive motion/change verbs vs.
  Zustandspassiv for transitive ones - "ist gegangen" vs. "ist
  verkauft" are structurally identical). Rather than guess, these are
  skipped entirely: precision over recall, same call as decision #52's
  threshold tuning.
- A passive's expressed agent (the "von + Dativ" phrase, e.g. "von einer
  Handvoll Leute unterstützt") is recovered too, via the participle's own
  "sbp" child and that child's "nk" grandchild - attributed as the
  participle's Subjekt (the semantic doer). Known limitation, not fixed:
  a measure-noun phrase ("eine Handvoll Leute") attaches "Handvoll" as
  the "nk" head, not "Leute" - the quantifier gets extracted instead of
  the real noun. Rare enough in practice not to special-case here.

Proper nouns (decision #56): names ("Trump", "Merz", "Deutschland") are
real grammatical subjects/objects but not collocates a learner should
memorize, so they're dropped. de_core_news_sm's NOUN/PROPN split is too
inconsistent per token to filter on directly - the same name comes out
PROPN in one sentence and NOUN in the next ("Trump" was NOUN in 8 of 131
sampled argument tokens), which would leave a thin residue of every name
behind, and would shave counts off genuine nouns occasionally mis-tagged
PROPN ("Mann", "Kind"). So the decision is made per lemma, not per token:
every NOUN/PROPN token in the corpus is tallied by lemma during the same
parse, and a lemma tagged PROPN in a strict majority of its occurrences
has all of its triples dropped at write time. Known limitation, not
fixed: a name the model tags NOUN most of the time ("Putin", "Russland")
still gets through. spaCy's NER was measured as a second signal and
rejected - it marks "Haus"/"Staat"/"Sohn"/"Straße" as entities often
enough to drop them too.

Example sentences: unlike lemma_collocations (decision #44), whose
examples come from collocation_examples (decision #41), a subject/object
pair is frequently NOT linearly adjacent - the entire reason this script
exists - so collocation_examples (built from adjacent surface-form pairs
only, see extract-examples.ts) can't serve these entries, and
CollocationList.tsx filters out any entry with zero examples. Rather than
a second full corpus pass, candidate examples are captured in this same
parse: word/clause-count simplicity scoring is computed inline (identical
logic to score_sentence_simplicity.py's score_sentence, reused here
instead of re-derived) and the best 3 per (verb, relation, argument)
triple are kept, same bounded-insertion-sort approach as
extract-examples.ts's considerCandidate/compareCandidates.
"""

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import spacy

# Mirrors database/src/filters.ts's isStopword/isNonAlphabetic exactly (a
# literal copy, not a shared file - see extract_verb_prepositions.py for the
# same convention and reasoning). Personal/reflexive pronouns being
# stopwords here does double duty: it also keeps pronoun subjects/objects
# ("er", "sie", "sich", ...) out of the output, which is exactly what we
# want - a learner-facing collocation list should show real nouns, not
# whichever pronoun happened to be the grammatical subject.
STOPWORDS = {
    # Pronouns
    "ich",
    "du",
    "er",
    "sie",
    "es",
    "wir",
    "ihr",
    "mich",
    "dich",
    "sich",
    "uns",
    "euch",
    "mir",
    "dir",
    "ihm",
    "ihn",
    "ihnen",
    "mein",
    "dein",
    "sein",
    "unser",
    "euer",
    "man",
    "allen",
    "alle",
    # Articles / determiners
    "der",
    "die",
    "das",
    "den",
    "dem",
    "des",
    "ein",
    "eine",
    "einem",
    "einen",
    "einer",
    "eines",
    "dieser",
    "diese",
    "dieses",
    "diesem",
    "diesen",
    "jeder",
    "jede",
    "jedes",
    "jedem",
    "jeden",
    # Conjunctions / particles
    "und",
    "oder",
    "aber",
    "auch",
    "noch",
    "dann",
    "denn",
    "doch",
    "schon",
    "nur",
    "nicht",
    "sondern",
    "weil",
    "dass",
    "wenn",
    "ob",
    "als",
    "wie",
}


def is_excluded_word(word: str) -> bool:
    """Mirrors database/src/filters.ts's shouldSkipWord exactly."""
    return word.lower() in STOPWORDS or not any(c.isalpha() for c in word)


# TIGER/Negra dependency labels -> the German grammatical-relation names
# shown to the user (matches the app's existing convention of German UI
# labels, e.g. CollocationList.tsx's SECTION_LABELS).
DIRECT_RELATION_LABELS = {
    "sb": "Subjekt",
    "oa": "Akkusativobjekt",
    "da": "Dativobjekt",
    "og": "Genitivobjekt",
}

# The passive agent phrase's own dependency label ("subject preposition")
# and the noun-phrase-head label inside it - hand-verified, see module
# docstring.
PASSIVE_AGENT_LABEL = "sbp"
NP_HEAD_DEP_LABEL = "nk"

# Sentence-simplicity scoring - identical logic to
# score_sentence_simplicity.py's score_sentence, reused inline here rather
# than joined from that script's separate output file (see module
# docstring's Example sentences section for why: this needs it per-token,
# during the same parse, not as a second pass).
EXCLUDED_POS = {"PUNCT", "SYM", "SPACE", "X"}
CLAUSE_VERB_POS = {"VERB", "AUX"}
MAX_EXAMPLES = 3

# Argument candidates, and the tags tallied per lemma to decide which of
# those candidates are proper nouns - see module docstring.
NOUN_POS = {"NOUN", "PROPN"}
PROPER_NOUN_MIN_SHARE = 0.5


def read_sentences(input_path: Path):
    """Stream (sentence_id, sentence_text) pairs out of sentences.txt."""
    with input_path.open("r", encoding="utf-8") as f:
        for line_number, raw_line in enumerate(f, start=1):
            line = raw_line.rstrip("\n")
            if not line:
                continue
            parts = line.split("\t", maxsplit=1)
            if len(parts) != 2:
                print(
                    f"warning: skipping malformed line {line_number} "
                    f"(expected 'id<TAB>sentence')",
                    file=sys.stderr,
                )
                continue
            id_text, sentence_text = parts
            try:
                sentence_id = int(id_text)
            except ValueError:
                print(
                    f"warning: skipping line {line_number}, unparseable id {id_text!r}",
                    file=sys.stderr,
                )
                continue
            if sentence_text.strip():
                yield sentence_id, sentence_text


def score_sentence(doc) -> tuple[int, int]:
    """Returns (word_count, clause_count) for one parsed sentence."""
    word_count = sum(1 for tok in doc if tok.pos_ not in EXCLUDED_POS)
    clause_count = sum(
        1
        for tok in doc
        if tok.pos_ in CLAUSE_VERB_POS
        and any(child.dep_ == "sb" for child in tok.children)
    )
    return word_count, clause_count


def walk_up_to_subject(start_token):
    """
    Walk up through however many aux/modal 'oc' links stack (perfect,
    modal, passive, or combinations of these) until finding the token
    that carries a direct "sb" child. Returns that child token, or None
    if the chain doesn't lead to one.
    """
    node = start_token
    seen = {id(node)}
    while True:
        head = node.head
        if id(head) in seen:
            return None
        for child in head.children:
            if child.dep_ == "sb":
                return child
        if head.dep_ == "oc" and head.pos_ in ("AUX", "VERB"):
            seen.add(id(head))
            node = head
            continue
        return None


def is_passive_participle(token) -> bool:
    """
    True if `token` is a Partizip II governed by a form of "werden" -
    i.e. Vorgangspassiv, not future tense (which is "werden" + Infinitiv)
    and not perfect tense (which is "haben" + Partizip II). See module
    docstring for the hand-verified sentences behind this rule.
    """
    if token.morph.get("VerbForm") != ["Part"]:
        return False
    head = token.head
    return head.pos_ == "AUX" and head.lemma_ == "werden"


def is_ambiguous_sein_participle(token) -> bool:
    """
    A Partizip II governed by "sein" is either Perfekt (a small class of
    intransitive motion/change verbs) or Zustandspassiv (transitive verbs)
    - structurally identical, genuinely ambiguous without a verb-class
    lexicon. Skipped rather than guessed (precision over recall).
    """
    if token.morph.get("VerbForm") != ["Part"]:
        return False
    head = token.head
    return head.pos_ == "AUX" and head.lemma_ == "sein"


def find_verb_arguments(token):
    """
    Yields (relation, argument_token) for every subject/object argument
    found for this verb token - both its own direct children and, when
    it's a participle embedded under an aux/modal chain, the argument
    resolved by walking up that chain. Only NOUN/PROPN arguments are
    yielded (pronouns, quantifiers, and nominalized-clause complements
    picked up by oa/da's dependency labels aren't nouns a learner wants
    to see - confirmed against real sample output that "wer"/"was"/
    "nichts"/"viele" are PRON while genuine argument nouns are NOUN/PROPN).
    PROPN is still yielded here on purpose: proper nouns are removed per
    lemma once the whole corpus has been tallied (find_proper_noun_lemmas),
    not per token - see module docstring.
    """
    if token.pos_ != "VERB":
        return

    verb_lemma = token.lemma_
    if is_excluded_word(verb_lemma):
        return

    has_own_subject = False
    for child in token.children:
        relation = DIRECT_RELATION_LABELS.get(child.dep_)
        if relation is None:
            continue
        if child.dep_ == "sb":
            has_own_subject = True
        if child.pos_ not in NOUN_POS:
            continue
        if is_excluded_word(child.lemma_):
            continue
        yield relation, child

    if has_own_subject or token.dep_ != "oc":
        return

    if is_ambiguous_sein_participle(token):
        return

    subject_token = walk_up_to_subject(token)
    passive = is_passive_participle(token)

    if (
        subject_token is not None
        and subject_token.pos_ in NOUN_POS
        and not is_excluded_word(subject_token.lemma_)
    ):
        yield ("Akkusativobjekt" if passive else "Subjekt"), subject_token

    if passive:
        for child in token.children:
            if child.dep_ != PASSIVE_AGENT_LABEL:
                continue
            for grandchild in child.children:
                if grandchild.dep_ != NP_HEAD_DEP_LABEL:
                    continue
                if grandchild.pos_ not in NOUN_POS:
                    continue
                if not is_excluded_word(grandchild.lemma_):
                    yield "Subjekt", grandchild


def compare_candidates(a: tuple, b: tuple) -> int:
    """
    a/b are (clause_count, word_count, ...) tuples - lower is simpler,
    same priority order as extract-examples.ts's compareCandidates
    (clause count primary, word count as tiebreaker).
    """
    if a[0] != b[0]:
        return a[0] - b[0]
    return a[1] - b[1]


def consider_candidate(best_by_triple: dict, key: tuple, candidate: tuple) -> None:
    """
    Keeps at most MAX_EXAMPLES candidates per triple, sorted best-first -
    same bounded-insertion-sort approach as extract-examples.ts's
    considerCandidate.
    """
    from functools import cmp_to_key

    candidates = best_by_triple.setdefault(key, [])
    if len(candidates) < MAX_EXAMPLES:
        candidates.append(candidate)
        candidates.sort(key=cmp_to_key(compare_candidates))
        return
    if compare_candidates(candidate, candidates[-1]) < 0:
        candidates[-1] = candidate
        candidates.sort(key=cmp_to_key(compare_candidates))


def find_proper_noun_lemmas(noun_counts: Counter, propn_counts: Counter) -> set:
    """
    Lemmas tagged PROPN in a strict majority of their NOUN/PROPN
    occurrences across the whole corpus - see module docstring for why
    this is decided per lemma rather than per token.
    """
    return {
        lemma
        for lemma, propn_count in propn_counts.items()
        if propn_count / noun_counts[lemma] > PROPER_NOUN_MIN_SHARE
    }


def extract_corpus(
    input_path: Path,
    model_name: str,
    pipe_batch_size: int,
    progress_every: int,
) -> tuple[Counter, dict]:
    print(f"loading spaCy model '{model_name}' (parser enabled, ner disabled)...")
    nlp = spacy.load(model_name, disable=["ner"])

    counts: Counter = Counter()
    best_examples_by_triple: dict = {}
    noun_counts: Counter = Counter()
    propn_counts: Counter = Counter()
    sentences_processed = 0
    started_at = time.monotonic()

    sentence_stream = read_sentences(input_path)
    text_and_id = ((text, sentence_id) for sentence_id, text in sentence_stream)

    for doc, sentence_id in nlp.pipe(
        text_and_id, batch_size=pipe_batch_size, as_tuples=True
    ):
        word_count, clause_count = score_sentence(doc)

        for token in doc:
            if token.pos_ in NOUN_POS:
                noun_counts[token.lemma_] += 1
                if token.pos_ == "PROPN":
                    propn_counts[token.lemma_] += 1

            for relation, argument_token in find_verb_arguments(token):
                verb_lemma = token.lemma_
                argument_lemma = argument_token.lemma_
                triple = (verb_lemma, relation, argument_lemma)
                counts[triple] += 1
                consider_candidate(
                    best_examples_by_triple,
                    triple,
                    (
                        clause_count,
                        word_count,
                        sentence_id,
                        doc.text,
                        token.text,
                        argument_token.text,
                    ),
                )

        sentences_processed += 1
        if sentences_processed % progress_every == 0:
            elapsed = time.monotonic() - started_at
            rate = sentences_processed / elapsed if elapsed > 0 else 0
            print(
                f"  {sentences_processed:,} sentences "
                f"({rate:,.0f}/sec, {len(counts):,} distinct verb/relation/argument triples so far)"
            )

    proper_noun_lemmas = find_proper_noun_lemmas(noun_counts, propn_counts)
    triples_before = len(counts)
    for triple in [t for t in counts if t[2] in proper_noun_lemmas]:
        del counts[triple]
        del best_examples_by_triple[triple]

    elapsed = time.monotonic() - started_at
    print(
        f"done: {sentences_processed:,} sentences, "
        f"{len(counts):,} distinct (verb, relation, argument) triples "
        f"({triples_before - len(counts):,} proper-noun triples dropped), "
        f"{elapsed:,.1f}s elapsed"
    )
    return counts, best_examples_by_triple


def write_output(counts: Counter, output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8") as f:
        for (verb, relation, argument), count in sorted(counts.items()):
            f.write(f"{verb}\t{relation}\t{argument}\t{count}\n")


def write_examples_output(best_examples_by_triple: dict, output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8") as f:
        for verb, relation, argument in sorted(best_examples_by_triple.keys()):
            candidates = best_examples_by_triple[(verb, relation, argument)]
            for (
                _clause_count,
                _word_count,
                _sentence_id,
                sentence,
                verb_surface,
                argument_surface,
            ) in candidates:
                f.write(
                    f"{verb}\t{relation}\t{argument}\t{sentence}\t{verb_surface}\t{argument_surface}\n"
                )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, required=True, help="Path to sentences.txt"
    )
    parser.add_argument(
        "--output", type=Path, required=True, help="Path to write verb_argument.tsv to"
    )
    parser.add_argument(
        "--examples-output",
        type=Path,
        required=True,
        help="Path to write verb_argument_examples.tsv to",
    )
    parser.add_argument("--model", default="de_core_news_sm", help="spaCy model name")
    parser.add_argument("--pipe-batch-size", type=int, default=1000)
    parser.add_argument("--progress-every", type=int, default=50_000)
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    counts, best_examples_by_triple = extract_corpus(
        input_path=args.input,
        model_name=args.model,
        pipe_batch_size=args.pipe_batch_size,
        progress_every=args.progress_every,
    )

    write_output(counts, args.output)
    print(f"wrote {args.output}")
    write_examples_output(best_examples_by_triple, args.examples_output)
    print(f"wrote {args.examples_output}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Extract adjective-noun attributive relations from the Leipzig sentences.txt
corpus using spaCy's dependency parse: for a given noun, which adjectives
genuinely modify it attributively ("das große Auto"), as opposed to
whatever adjective happens to sit next to it (lemma_collocations' plain
adjacency, decision #44) or a predicative use ("das Auto ist groß") that
isn't a noun-modifying fact at all.

This script is intentionally standalone (same spirit as tag_words.py /
extract_verb_prepositions.py / extract_verb_arguments.py): it runs once,
on a laptop, and produces TSVs that get shipped to the VM the same way the
raw Leipzig files are. It is never containerized and never part of the
deploy path.

Usage:
    python extract_adjective_attributes.py --input ../../data/sentences.txt \
        --output adjective_attribute.tsv --examples-output adjective_attribute_examples.tsv

Input format (tab-separated, per Leipzig's sentences.txt):
    <id>\t<sentence text>

Output formats (tab-separated):
    adjective_attribute.tsv:          <noun_lemma>\t<adjective_lemma>\t<count>
    adjective_attribute_examples.tsv: <noun_lemma>\t<adjective_lemma>\t<sentence>\t<noun_surface>\t<adjective_surface>

Unlike verb_arguments (decision #53), there's only one relation here
(attributive) - no grammatical_relation column, since a (noun, adjective)
pair can't legitimately mean two different things the way (verb, argument)
can (Subjekt vs. Akkusativobjekt).

Hand-verified against 14 real sentences before writing this (see
docs/decisions.md for the full session), covering plain attributive,
predicative, stacked attributives, genitive/accusative case, comparative/
superlative, an attributive participle, a nominalized adjective, and 2-way
and 3-way coordination:

- A direct attributive adjective is an ADJ token with dep_ == "nk" whose
  head is NOUN/PROPN (TIGER/Negra scheme, same "nk" label decision #52
  found on a preposition's case-bearing child). Holds regardless of case
  or comparison degree.
- Predicative use is excluded for free, with no dep_-based check needed:
  German predicative adjectives never carry an agreement ending ("groß",
  not "großes"/"große"), and spaCy's de_core_news_sm tags the
  uninflected predicate form as ADV, not ADJ - confirmed empirically
  ("Das Auto ist sehr groß." produces no ADJ token at all for "groß").
- Nominalized adjectives ("Die Alten saßen...") are excluded the same
  way - tagged NOUN, not ADJ, so they never enter this extraction at all.
- Attributive participles ("das gekaufte Auto") need no special-casing,
  unlike verb_arguments' passive-voice handling: spaCy already tags an
  attributively-used participle as ADJ with dep_ == "nk" (identical shape
  to a plain adjective), while a periphrastic passive/perfect participle
  ("wurde verkauft", "hat gekauft") stays VERB with dep_ == "oc". The
  inflected/uninflected distinction that separates predicative from
  attributive adjectives does the same job here for free.
- Coordinated adjectives need real handling, though: in "großes und
  teures Auto", only "großes" attaches directly to "Auto" via nk -
  "teures" attaches to "und" (dep_ == "cj"), and "und" attaches to
  "großes" (dep_ == "cd"). For a 3-way coordination ("großes, teures und
  schnelles Auto") the chain is longer still (schnelles -> und -> teures
  -> großes -> Auto) - the number of hops isn't fixed, so this requires
  walking up through cj/cd links until a token with dep_ == "nk" is
  found, the same shape of technique decision #53 used for walking up
  aux/modal chains to find a passive's subject (see find_attributive_noun
  below).
"""

import argparse
import sys
import time
from collections import Counter
from functools import cmp_to_key
from pathlib import Path

import spacy

# TIGER/Negra dependency labels - hand-verified, see module docstring.
# TIGER/Negra dependency labels - hand-verified, see module docstring.
# TIGER/Negra dependency labels - hand-verified, see module docstring.
# TIGER/Negra dependency labels - hand-verified, see module docstring.
# TIGER/Negra dependency labels - hand-verified, see module docstring.

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


# TIGER/Negra dependency labels - hand-verified, see module docstring.
ATTRIBUTIVE_DEP_LABEL = "nk"
COORDINATION_DEP_LABELS = {"cj", "cd"}

# Sentence-simplicity scoring - identical logic to
# score_sentence_simplicity.py's score_sentence, reused inline (same
# convention as extract_verb_arguments.py).
EXCLUDED_POS = {"PUNCT", "SYM", "SPACE", "X"}
CLAUSE_VERB_POS = {"VERB", "AUX"}
MAX_EXAMPLES = 3


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


def find_attributive_noun(adj_token):
    """
    Walks up through however many cj/cd coordination links stack (a
    coordinated list of attributive adjectives - see module docstring)
    until finding the token that's itself directly attached to its noun
    via "nk". Returns that noun token, or None if the chain doesn't lead
    to one. Same cycle-safety shape as extract_verb_arguments.py's
    walk_up_to_subject.
    """
    node = adj_token
    seen = {id(node)}
    while True:
        if node.dep_ == ATTRIBUTIVE_DEP_LABEL and node.head.pos_ in ("NOUN", "PROPN"):
            return node.head
        if node.dep_ not in COORDINATION_DEP_LABELS:
            return None
        head = node.head
        if id(head) in seen:
            return None
        seen.add(id(head))
        node = head


def find_adjective_attributes(token):
    """
    Yields (noun_token, adjective_token) if `token` is an ADJ that
    attributively modifies a noun - either directly or through a chain of
    coordinated adjectives. Excludes stopword/non-alphabetic lemmas on
    both sides.
    """
    if token.pos_ != "ADJ":
        return
    if is_excluded_word(token.lemma_):
        return
    noun_token = find_attributive_noun(token)
    if noun_token is None:
        return
    if is_excluded_word(noun_token.lemma_):
        return
    yield noun_token, token


def compare_candidates(a: tuple, b: tuple) -> int:
    """
    a/b are (clause_count, word_count, ...) tuples - lower is simpler,
    same priority order as extract_verb_arguments.py's compare_candidates.
    """
    if a[0] != b[0]:
        return a[0] - b[0]
    return a[1] - b[1]


def consider_candidate(best_by_pair: dict, key: tuple, candidate: tuple) -> None:
    """
    Keeps at most MAX_EXAMPLES candidates per pair, sorted best-first -
    same bounded-insertion-sort approach as extract_verb_arguments.py's
    consider_candidate.
    """
    candidates = best_by_pair.setdefault(key, [])
    if len(candidates) < MAX_EXAMPLES:
        candidates.append(candidate)
        candidates.sort(key=cmp_to_key(compare_candidates))
        return
    if compare_candidates(candidate, candidates[-1]) < 0:
        candidates[-1] = candidate
        candidates.sort(key=cmp_to_key(compare_candidates))


def write_output(counts: Counter, output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8") as f:
        for (noun, adjective), count in sorted(counts.items()):
            f.write(f"{noun}\t{adjective}\t{count}\n")


def write_examples_output(best_examples_by_pair: dict, output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8") as f:
        for noun, adjective in sorted(best_examples_by_pair.keys()):
            candidates = best_examples_by_pair[(noun, adjective)]
            for (
                _clause_count,
                _word_count,
                _sentence_id,
                sentence,
                noun_surface,
                adjective_surface,
            ) in candidates:
                f.write(
                    f"{noun}\t{adjective}\t{sentence}\t{noun_surface}\t{adjective_surface}\n"
                )


def extract_corpus(
    input_path: Path,
    model_name: str,
    pipe_batch_size: int,
    progress_every: int,
) -> tuple[Counter, dict]:
    print(f"loading spaCy model '{model_name}' (parser enabled, ner disabled)...")
    nlp = spacy.load(model_name, disable=["ner"])

    counts: Counter = Counter()
    best_examples_by_pair: dict = {}
    sentences_processed = 0
    started_at = time.monotonic()

    sentence_stream = read_sentences(input_path)
    text_and_id = ((text, sentence_id) for sentence_id, text in sentence_stream)

    for doc, sentence_id in nlp.pipe(
        text_and_id, batch_size=pipe_batch_size, as_tuples=True
    ):
        word_count, clause_count = score_sentence(doc)

        for token in doc:
            for noun_token, adjective_token in find_adjective_attributes(token):
                noun_lemma = noun_token.lemma_
                adjective_lemma = adjective_token.lemma_
                pair = (noun_lemma, adjective_lemma)
                counts[pair] += 1
                consider_candidate(
                    best_examples_by_pair,
                    pair,
                    (
                        clause_count,
                        word_count,
                        sentence_id,
                        doc.text,
                        noun_token.text,
                        adjective_token.text,
                    ),
                )

        sentences_processed += 1
        if sentences_processed % progress_every == 0:
            elapsed = time.monotonic() - started_at
            rate = sentences_processed / elapsed if elapsed > 0 else 0
            print(
                f"  {sentences_processed:,} sentences "
                f"({rate:,.0f}/sec, {len(counts):,} distinct noun/adjective pairs so far)"
            )

    elapsed = time.monotonic() - started_at
    print(
        f"done: {sentences_processed:,} sentences, "
        f"{len(counts):,} distinct (noun, adjective) pairs, {elapsed:,.1f}s elapsed"
    )
    return counts, best_examples_by_pair


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", type=Path, required=True, help="Path to sentences.txt"
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path to write adjective_attribute.tsv to",
    )
    parser.add_argument(
        "--examples-output",
        type=Path,
        required=True,
        help="Path to write adjective_attribute_examples.tsv to",
    )
    parser.add_argument("--model", default="de_core_news_sm", help="spaCy model name")
    parser.add_argument("--pipe-batch-size", type=int, default=1000)
    parser.add_argument("--progress-every", type=int, default=50_000)
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    counts, best_examples_by_pair = extract_corpus(
        input_path=args.input,
        model_name=args.model,
        pipe_batch_size=args.pipe_batch_size,
        progress_every=args.progress_every,
    )

    write_output(counts, args.output)
    print(f"wrote {args.output}")
    write_examples_output(best_examples_by_pair, args.examples_output)
    print(f"wrote {args.examples_output}")


if __name__ == "__main__":
    main()

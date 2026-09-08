#!/usr/bin/env python3
"""
Extract governed verb-preposition pairs (Rektion) from the Leipzig
sentences.txt corpus using spaCy's dependency parse: for every verb, which
preposition(s) does it require, and in which grammatical case?

This script is intentionally standalone (same spirit as tag_words.py): it
runs once, on a laptop, and produces a TSV that gets shipped to the VM the
same way the raw Leipzig files are. It is never containerized and never
part of the deploy path.

Usage:
    python extract_verb_prepositions.py --input ../../data/sentences.txt --output verb_preposition.tsv

Input format (tab-separated, per Leipzig's sentences.txt):
    <id>\t<sentence text>

Output format (tab-separated):
    <verb_lemma>\t<preposition>\t<case>\t<count>

<case> is one of Akkusativ/Dativ/Genitiv, or empty if spaCy's morphology
didn't resolve a Case feature on the governed noun phrase's head.

Why the dependency parse, not plain adjacency (like extract_lemmas.py's
lemma_collocations): hand-checked against the corpus's own lemma_collocations
data first (verb x ADP-dominant partner, ranked by logDice) for 8 known
Rektion verbs. It works for some ("warten"->"auf", "erinnern"->"an",
"traeumen"->"von" all came out clearly dominant) but fails outright for
reflexive verbs: "freuen"'s true government (ueber/auf) scored 0.59/0.53,
buried under noise like "hinaus" at 4.20, and "interessieren"'s true
government ("fuer") scored *negative*. Cause: the reflexive pronoun ("sich")
sits between verb and preposition and is filtered as a stopword, breaking
literal adjacency. A dependency parse doesn't have this problem - "auf" in
"freuen ... auf" is a direct syntactic child of "freuen" regardless of what
sits in between. Hand-verified this directly (see PP_DEP_LABELS below)
before writing this script.
"""

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import spacy

# Mirrors database/src/filters.ts's isStopword/isNonAlphabetic exactly (a
# literal copy, not a shared file - this tool is intentionally standalone
# from the rest of the repo, same as extract_lemmas.py). Only matters on
# the verb side in practice (e.g. "sein" collides with the possessive-
# pronoun stopword "sein"): a governed preposition for a filtered verb
# lemma would have no matching row in `lemmas` and get silently skipped by
# the loader anyway, but filtering here keeps the output file itself clean
# and matches this project's established convention for every corpus-scan
# tool.
STOPWORDS = {
    # Pronouns
    "ich", "du", "er", "sie", "es", "wir", "ihr", "mich", "dich", "sich",
    "uns", "euch", "mir", "dir", "ihm", "ihn", "ihnen", "mein", "dein",
    "sein", "unser", "euer", "man",
    # Articles / determiners
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einem",
    "einen", "einer", "eines", "dieser", "diese", "dieses", "diesem",
    "diesen", "jeder", "jede", "jedes", "jedem", "jeden",
    # Conjunctions / particles
    "und", "oder", "aber", "auch", "noch", "dann", "denn", "doch",
    "schon", "nur", "nicht", "sondern", "weil", "dass", "wenn", "ob",
    "als", "wie",
}


def is_excluded_word(word: str) -> bool:
    """Mirrors database/src/filters.ts's shouldSkipWord exactly."""
    return word.lower() in STOPWORDS or not any(c.isalpha() for c in word)


# Hand-verified against real sentences (see module docstring) with
# nlp.load(..., disable=["ner"]): a governed preposition attaches directly
# to its verb (token.head is the verb) with dep_ "mo" or "op" - both occur
# for genuine PP complements in the test sentences (e.g. "Ich warte auf
# den Bus" -> "auf" is "mo"; "Er wartet schon lange auf seine Antwort" ->
# "auf" is "op", same head). A separable verb prefix picked up onto the
# verb the same way (e.g. "nach" in "denkt ... nach", nachdenken) is
# labelled "svp", not "mo"/"op", so it's naturally excluded from this set
# without a special case - confirmed it also has no "nk" child (below),
# which independently filters it out again.
PP_DEP_LABELS = {"mo", "op"}

# The preposition's own child that heads its noun phrase ("nk" = noun
# kernel, same label used elsewhere in this parse scheme). Hand-verified:
# in "auf den Bus", "Bus" (not "den") is "auf"'s direct "nk" child, and
# "Bus" itself carries the Case morphology feature directly - the
# preposition token's own morph is always empty. Requiring this child to
# exist is also what filters out separable-verb-prefix ADPs (see above):
# those have no children at all.
NP_HEAD_DEP_LABEL = "nk"

CASE_LABELS = {"Nom": "Nominativ", "Gen": "Genitiv", "Dat": "Dativ", "Acc": "Akkusativ"}


def read_sentences(input_path: Path):
    """
    Stream sentence text out of sentences.txt, one at a time. Same
    generator shape as tag_words.py's read_sentences - see that file for
    why this is a generator, not a list.
    """
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
            _sentence_id, sentence_text = parts
            if sentence_text.strip():
                yield sentence_text


def governed_case(preposition_token) -> str:
    """
    Returns the German case name governed by this preposition token, or
    "" if its noun-phrase head has no resolvable Case morphology feature.
    """
    for child in preposition_token.children:
        if child.dep_ != NP_HEAD_DEP_LABEL:
            continue
        case_values = child.morph.get("Case")
        if case_values:
            return CASE_LABELS.get(case_values[0], "")
    return ""


def extract_corpus(
    input_path: Path,
    model_name: str,
    pipe_batch_size: int,
    progress_every: int,
) -> Counter:
    """
    Runs the spaCy pipeline (tagger + parser) over every sentence and
    returns a Counter keyed by (verb_lemma, preposition, case) -> count.

    Only ner is disabled: like score_sentence_simplicity.py (and unlike
    tag_words.py/extract_lemmas.py), this needs the dependency parse to
    find which preposition attaches to which verb - see module docstring
    for why plain adjacency isn't enough here.
    """
    print(f"loading spaCy model '{model_name}' (parser enabled, ner disabled)...")
    nlp = spacy.load(model_name, disable=["ner"])

    counts: Counter = Counter()
    sentences_processed = 0
    started_at = time.monotonic()

    sentence_stream = read_sentences(input_path)

    for doc in nlp.pipe(sentence_stream, batch_size=pipe_batch_size):
        for token in doc:
            if token.pos_ not in ("VERB", "AUX"):
                continue
            verb_lemma = token.lemma_
            if is_excluded_word(verb_lemma):
                continue

            for child in token.children:
                if child.pos_ != "ADP" or child.dep_ not in PP_DEP_LABELS:
                    continue
                preposition = child.lemma_
                if is_excluded_word(preposition):
                    continue
                case = governed_case(child)
                counts[(verb_lemma, preposition, case)] += 1

        sentences_processed += 1
        if sentences_processed % progress_every == 0:
            elapsed = time.monotonic() - started_at
            rate = sentences_processed / elapsed if elapsed > 0 else 0
            print(
                f"  {sentences_processed:,} sentences "
                f"({rate:,.0f}/sec, {len(counts):,} distinct verb/preposition/case triples so far)"
            )

    elapsed = time.monotonic() - started_at
    print(
        f"done: {sentences_processed:,} sentences, "
        f"{len(counts):,} distinct (verb, preposition, case) triples, {elapsed:,.1f}s elapsed"
    )
    return counts


def write_output(counts: Counter, output_path: Path) -> None:
    """Sorted, diffable output - same spirit as the other scripts' writers."""
    with output_path.open("w", encoding="utf-8") as f:
        for (verb, preposition, case), count in sorted(counts.items()):
            f.write(f"{verb}\t{preposition}\t{case}\t{count}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Path to sentences.txt")
    parser.add_argument(
        "--output", type=Path, required=True, help="Path to write verb_preposition.tsv to"
    )
    parser.add_argument("--model", default="de_core_news_sm", help="spaCy model name")
    parser.add_argument("--pipe-batch-size", type=int, default=1000)
    parser.add_argument("--progress-every", type=int, default=50_000)
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    counts = extract_corpus(
        input_path=args.input,
        model_name=args.model,
        pipe_batch_size=args.pipe_batch_size,
        progress_every=args.progress_every,
    )

    write_output(counts, args.output)
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()

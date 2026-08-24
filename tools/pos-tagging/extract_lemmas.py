#!/usr/bin/env python3
"""
Tag every token in the Leipzig sentences.txt corpus with its lemma using
spaCy, and produce two aggregate counts:

  1. (surface_form, lemma) -> occurrence count
  2. (left_lemma, right_lemma) -> adjacency count, for adjacent token
     pairs within a sentence

This script is intentionally standalone (same spirit as tag_words.py): it
runs once, on a laptop, and produces TSVs that get shipped to the VM the
same way the raw Leipzig files are. It is never containerized and never
part of the deploy path.

Usage:
    python extract_lemmas.py --input ../../data/sentences.txt \
        --word-lemma-output word_lemma.tsv \
        --lemma-collocations-output lemma_collocations.tsv

Input format (tab-separated, per Leipzig's sentences.txt):
    <id>\t<sentence text>

Output formats (tab-separated):
    word_lemma.tsv:          <word>\t<lemma>\t<count>
    lemma_collocations.tsv:  <left_lemma>\t<right_lemma>\t<count>
"""

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import spacy

# Same set as tag_words.py's EXCLUDED_POS: tokens that can never
# correspond to a real corpus "word" row, or a meaningful adjacency
# partner.
EXCLUDED_POS = {"PUNCT", "SYM", "SPACE", "X"}

# Mirrors database/src/filters.ts's STOPWORDS exactly (kept as a literal
# copy, not a shared file, matching this tool's already-standalone,
# cross-language relationship to the rest of the repo). load-data.ts
# already excludes these from `words`/`collocations` - discovered the
# hard way that skipping this same filter here breaks logDice: a
# stopword's cooccurrence gets tallied from the full unfiltered corpus
# scan, but lemma_frequency (built from the already-filtered `words`
# table) has almost none of its true frequency, since load-lemmas.ts
# only loads rows whose word matches something in `words`. That
# mismatched numerator/denominator is what let "der"/"und" outscore
# real collocations (logDice > 11, higher than anything genuine).
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
    """
    Mirrors database/src/filters.ts's shouldSkipWord exactly
    (isNonAlphabetic(word) || isStopword(word)) - both checks, not just
    the stopword one. A token missed here but excluded from `words` by
    load-data.ts hits the same numerator/denominator mismatch that broke
    "der"/"und": its cooccurrence gets tallied from this full unfiltered
    scan, but lemma_frequency (sourced from the already-filtered `words`
    table) has almost none of its true frequency. isNonAlphabetic covers
    tokens with no letter at all (pure numbers, stray symbols) - EXCLUDED_POS
    catches most of these via PUNCT/SYM, but not NUM-tagged tokens like
    plain digit strings, so this check is not redundant with that one.
    """
    return word.lower() in STOPWORDS or not any(c.isalpha() for c in word)


def read_sentences(input_path: Path):
    """
    Stream sentence text out of sentences.txt, one at a time. Same
    generator shape as tag_words.py's read_sentences - see that file
    for why this is a generator, not a list.
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


def extract_corpus(
    input_path: Path,
    model_name: str,
    pipe_batch_size: int,
    progress_every: int,
) -> tuple[Counter, Counter]:
    """
    Runs the spaCy pipeline over every sentence and returns two
    Counters: (word, lemma) -> count, and (left_lemma, right_lemma) ->
    adjacency count.

    parser and ner are disabled: lemma accuracy was verified by hand to
    be identical with the parser disabled (confirmed against real
    sentences containing ambiguous genitive/case forms before choosing
    this), so this reuses tag_words.py's fast tagger-only speed class
    rather than score_sentence_simplicity.py's slower parser-enabled one.

    Adjacency is computed over the FILTERED token sequence (excluded-POS
    tokens removed first), not raw positional adjacency - this matches
    how database/scripts/extract-examples.ts already defines adjacency
    (its tokenizer strips punctuation-only tokens out of the sequence
    before treating what's left as adjacent), so a comma between two
    content words doesn't prevent them from counting as adjacent here
    any more than it does there.
    """
    print(f"loading spaCy model '{model_name}' (parser and ner disabled)...")
    nlp = spacy.load(model_name, disable=["parser", "ner"])

    word_lemma_counts: Counter = Counter()
    lemma_pair_counts: Counter = Counter()
    sentences_processed = 0
    started_at = time.monotonic()

    sentence_stream = read_sentences(input_path)

    for doc in nlp.pipe(sentence_stream, batch_size=pipe_batch_size):
        # (lemma, is_excluded) per kept token - excluded words (stopwords
        # or non-alphabetic, matching load-data.ts's shouldSkipWord)
        # stay in this positional sequence (so they still correctly
        # break adjacency between their neighbors, unlike excluded-POS
        # punctuation, which is dropped from the sequence entirely) but
        # are excluded from both counters below.
        kept = []
        for token in doc:
            if token.pos_ in EXCLUDED_POS:
                continue
            excluded = is_excluded_word(token.text)
            if not excluded:
                word_lemma_counts[(token.text, token.lemma_)] += 1
            kept.append((token.lemma_, excluded))

        for (left_lemma, left_excluded), (right_lemma, right_excluded) in zip(kept, kept[1:]):
            if left_excluded or right_excluded:
                continue
            lemma_pair_counts[(left_lemma, right_lemma)] += 1

        sentences_processed += 1
        if sentences_processed % progress_every == 0:
            elapsed = time.monotonic() - started_at
            rate = sentences_processed / elapsed if elapsed > 0 else 0
            print(
                f"  {sentences_processed:,} sentences ({rate:,.0f}/sec, "
                f"{len(word_lemma_counts):,} distinct word/lemma pairs, "
                f"{len(lemma_pair_counts):,} distinct lemma pairs so far)"
            )

    elapsed = time.monotonic() - started_at
    print(
        f"done: {sentences_processed:,} sentences, "
        f"{len(word_lemma_counts):,} distinct (word, lemma) pairs, "
        f"{len(lemma_pair_counts):,} distinct lemma pairs, "
        f"{elapsed:,.1f}s elapsed"
    )
    return word_lemma_counts, lemma_pair_counts


def write_pair_counts(counts: Counter, output_path: Path) -> None:
    """Sorted, diffable output - same spirit as tag_words.py's writer."""
    with output_path.open("w", encoding="utf-8") as f:
        for (a, b), count in sorted(counts.items()):
            f.write(f"{a}\t{b}\t{count}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Path to sentences.txt")
    parser.add_argument(
        "--word-lemma-output", type=Path, required=True, help="Path to write word_lemma.tsv to"
    )
    parser.add_argument(
        "--lemma-collocations-output",
        type=Path,
        required=True,
        help="Path to write lemma_collocations.tsv to",
    )
    parser.add_argument("--model", default="de_core_news_sm", help="spaCy model name")
    parser.add_argument("--pipe-batch-size", type=int, default=1000)
    parser.add_argument("--progress-every", type=int, default=50_000)
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    word_lemma_counts, lemma_pair_counts = extract_corpus(
        input_path=args.input,
        model_name=args.model,
        pipe_batch_size=args.pipe_batch_size,
        progress_every=args.progress_every,
    )

    write_pair_counts(word_lemma_counts, args.word_lemma_output)
    print(f"wrote {args.word_lemma_output}")
    write_pair_counts(lemma_pair_counts, args.lemma_collocations_output)
    print(f"wrote {args.lemma_collocations_output}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Tag every token in the Leipzig sentences.txt corpus with its coarse
part-of-speech (Universal POS) using spaCy, and aggregate to
(surface_form, pos) -> count.

This script is intentionally standalone: it runs once, on a laptop,
and produces a TSV that gets shipped to the VM the same way the raw
Leipzig files are. It is never containerized and never part of the
deploy path.

Usage:
    python tag_words.py --input ../../data/sentences.txt --output word_pos.tsv

Input format (tab-separated, per Leipzig's sentences.txt):
    <id>\t<sentence text>

Output format (tab-separated):
    <word>\t<POS>\t<count>
"""

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import spacy

# Token POS tags that can never correspond to a real corpus "word" row
# (Leipzig's words.txt is built from actual word tokens, not bare
# punctuation or whitespace). Dropping these keeps the output file
# smaller and avoids rows that can never join against `words`.
EXCLUDED_POS = {"PUNCT", "SYM", "SPACE", "X"}


def read_sentences(input_path: Path):
    """
    Stream sentence text out of sentences.txt, one at a time.

    Deliberately a generator, not a list: at 1M lines this keeps
    memory flat, matching the streaming pattern already used in
    database/scripts/load-data.ts and extract-examples.ts.

    Malformed lines (missing the id\tsentence tab) are skipped with a
    warning rather than crashing the whole run - a few bad lines in a
    million-line file shouldn't lose the other 999,999.
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


def batched(iterable, batch_size: int):
    """
    Group an iterable into lists of at most batch_size, without
    materializing the whole input. nlp.pipe() accepts an iterable
    directly and does its own internal batching, but chunking here
    keeps memory bounded and gives us a natural place to report
    progress between chunks.
    """
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def tag_corpus(
    input_path: Path,
    model_name: str,
    pipe_batch_size: int,
    progress_every: int,
) -> Counter:
    """
    Run the spaCy pipeline over every sentence in the corpus and
    return a Counter keyed by (surface_form, pos) -> occurrence count.

    parser and ner are disabled: only the tagger component is needed,
    and disabling the rest is a well-documented, significant speedup
    in spaCy since those components would otherwise do real work
    (dependency parsing, entity recognition) that this script throws
    away.
    """
    print(f"loading spaCy model '{model_name}' (parser and ner disabled)...")
    nlp = spacy.load(model_name, disable=["parser", "ner"])

    counts: Counter = Counter()
    sentences_processed = 0
    tokens_kept = 0
    started_at = time.monotonic()

    sentence_stream = read_sentences(input_path)

    # nlp.pipe() is spaCy's batched-processing API: it processes many
    # documents together internally (vectorized where possible)
    # instead of paying per-call Python/model overhead for each single
    # sentence. Calling nlp(sentence) in a plain loop re-pays that
    # overhead every time; at 1M sentences that difference is the gap
    # between minutes and hours.
    for doc in nlp.pipe(sentence_stream, batch_size=pipe_batch_size):
        for token in doc:
            if token.pos_ in EXCLUDED_POS:
                continue
            counts[(token.text, token.pos_)] += 1
            tokens_kept += 1

        sentences_processed += 1
        if sentences_processed % progress_every == 0:
            elapsed = time.monotonic() - started_at
            rate = sentences_processed / elapsed if elapsed > 0 else 0
            print(
                f"  {sentences_processed:,} sentences "
                f"({rate:,.0f}/sec, {len(counts):,} distinct word/POS pairs so far)"
            )

    elapsed = time.monotonic() - started_at
    print(
        f"done: {sentences_processed:,} sentences, {tokens_kept:,} tagged tokens "
        f"kept, {len(counts):,} distinct (word, pos) pairs, {elapsed:,.1f}s elapsed"
    )
    return counts


def write_output(counts: Counter, output_path: Path) -> None:
    """
    Write (word, pos, count) rows sorted by word, then pos - stable,
    diffable output, same spirit as the migration runner's sorted
    filename processing.
    """
    with output_path.open("w", encoding="utf-8") as f:
        for (word, pos), count in sorted(counts.items()):
            f.write(f"{word}\t{pos}\t{count}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to sentences.txt",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path to write the output TSV to",
    )
    parser.add_argument(
        "--model",
        default="de_core_news_sm",
        help="spaCy model name (default: de_core_news_sm)",
    )
    parser.add_argument(
        "--pipe-batch-size",
        type=int,
        default=1000,
        help="Batch size passed to nlp.pipe() (default: 1000)",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=50_000,
        help="Print a progress line every N sentences (default: 50000)",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    counts = tag_corpus(
        input_path=args.input,
        model_name=args.model,
        pipe_batch_size=args.pipe_batch_size,
        progress_every=args.progress_every,
    )

    write_output(counts, args.output)
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()

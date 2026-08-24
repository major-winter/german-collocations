#!/usr/bin/env python3
"""
Score every sentence in the Leipzig sentences.txt corpus for how simple it
reads, using spaCy's dependency parse, and write a per-sentence TSV of the
raw signals.

This script is intentionally standalone (same spirit as tag_words.py): it
runs once, on a laptop, and produces a TSV that gets shipped to the VM the
same way the raw Leipzig files are. It is never containerized and never
part of the deploy path.

Usage:
    python score_sentence_simplicity.py --input ../../data/sentences.txt --output sentence_simplicity.tsv

Input format (tab-separated, per Leipzig's sentences.txt):
    <id>\t<sentence text>

Output format (tab-separated):
    <sentence_id>\t<word_count>\t<clause_count>

Raw counts are written, not a baked-in "is this simple" boolean - keeping
the threshold decision in the downstream loader (database/scripts/
extract-examples.ts) means it can be retuned without repaying the cost of
a full corpus parse.
"""

import argparse
import sys
import time
from pathlib import Path

import spacy

# Token POS tags that don't count as "words" for the length signal - same
# concept as tag_words.py's EXCLUDED_POS, redefined locally since this
# script is deliberately standalone (see module docstring).
EXCLUDED_POS = {"PUNCT", "SYM", "SPACE", "X"}

# A verb/aux token with its own subject child ("sb") marks a distinct
# clause. This is deliberately NOT "count finite verbs" or "count oc
# dependents" - both were tried against real sentences and rejected:
#
# - spaCy's morphology (VerbForm=Fin) is unreliable in de_core_news_sm; it
#   silently missed finite verbs in real test sentences.
# - The "oc" dependency label is overloaded: it fires both for genuine
#   subordinate/complement clauses AND for ordinary periphrastic aux+
#   participle constructions (passive "wurden evakuiert", perfect "habe
#   angerufen"), so counting it directly produces false positives.
#
# Requiring the verb/aux to have its own "sb" child sidesteps both
# problems: periphrastic constructions share the aux's subject (the
# participle has no "sb" child of its own), and compound predicates
# ("ging ... und aß", shared subject) collapse to one clause, while
# relative clauses, reported speech, and genuine subordinate clauses -
# each of which introduces its own subject - are still counted.
CLAUSE_VERB_POS = {"VERB", "AUX"}


def read_sentences(input_path: Path):
    """
    Stream (sentence_id, sentence_text) pairs out of sentences.txt.

    Deliberately a generator, not a list: at 1M lines this keeps memory
    flat, matching the streaming pattern already used in tag_words.py and
    database/scripts/extract-examples.ts.

    Malformed lines (missing the id\tsentence tab, or a non-integer id)
    are skipped with a warning rather than crashing the whole run.
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
            id_text, sentence_text = parts
            try:
                sentence_id = int(id_text)
            except ValueError:
                print(
                    f"warning: skipping line {line_number}, "
                    f"unparseable id {id_text!r}",
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


def score_corpus(
    input_path: Path,
    output_path: Path,
    model_name: str,
    pipe_batch_size: int,
    progress_every: int,
) -> None:
    """
    Runs the spaCy pipeline (tagger + parser) over every sentence in the
    corpus and streams (sentence_id, word_count, clause_count) rows to
    output_path as it goes - not accumulated in memory, since this is a
    1M-row output.

    Only ner is disabled: unlike tag_words.py (tagger only), this script
    needs the dependency parser to compute clause_count.
    """
    print(f"loading spaCy model '{model_name}' (parser enabled, ner disabled)...")
    nlp = spacy.load(model_name, disable=["ner"])

    sentences_processed = 0
    started_at = time.monotonic()

    sentence_stream = read_sentences(input_path)

    with output_path.open("w", encoding="utf-8") as out:
        # as_tuples=True pipes (text, context) pairs through and hands
        # back (doc, context) - context (the sentence_id here) rides
        # alongside spaCy's internal batching without extra bookkeeping.
        text_and_id = ((text, sentence_id) for sentence_id, text in sentence_stream)
        for doc, sentence_id in nlp.pipe(
            text_and_id, batch_size=pipe_batch_size, as_tuples=True
        ):
            word_count, clause_count = score_sentence(doc)
            out.write(f"{sentence_id}\t{word_count}\t{clause_count}\n")

            sentences_processed += 1
            if sentences_processed % progress_every == 0:
                elapsed = time.monotonic() - started_at
                rate = sentences_processed / elapsed if elapsed > 0 else 0
                print(
                    f"  {sentences_processed:,} sentences "
                    f"({rate:,.0f}/sec)"
                )

    elapsed = time.monotonic() - started_at
    print(
        f"done: {sentences_processed:,} sentences scored, {elapsed:,.1f}s elapsed"
    )


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

    score_corpus(
        input_path=args.input,
        output_path=args.output,
        model_name=args.model,
        pipe_batch_size=args.pipe_batch_size,
        progress_every=args.progress_every,
    )
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()

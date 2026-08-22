-- Adds word_pos: raw (word, POS tag, occurrence count) triples,
-- produced offline by tools/pos-tagging/tag_words.py and loaded by
-- database/scripts/load-pos.ts.
--
-- Deliberately a separate table, not a column on `words`. `words`
-- already carries two STORED GENERATED columns (word_normalized,
-- word_folded — see decision #30); adding a column there would
-- trigger a full table rewrite for a feature that doesn't need to
-- live on that table at all. This follows the same additive
-- separate-table pattern already used for word_pos's siblings
-- (sentences / collocation_examples).
--
-- This table stores raw counts per (word, pos) pair, not a
-- precomputed "dominant tag" or share. That decision is deliberate:
-- the dominance threshold used for POS-based filtering/grouping is
-- not yet chosen (pending an EXPLAIN-driven decile analysis on real
-- loaded data), and counts let that threshold be changed later with
-- a query, not a re-tag or a schema change. A word with genuinely
-- ambiguous grammatical role (e.g. "sein" as AUX vs. DET) is expected
-- to have multiple rows here — that is the correct, intended shape,
-- not a data quality problem.
--
-- Whether "the dominant tag per word" is served by a view or a
-- second materialized table is an open question, to be settled by
-- EXPLAIN (ANALYZE, BUFFERS) against this table once real data is
-- loaded — not decided in this migration.

CREATE TABLE word_pos (
  word_id  int  NOT NULL REFERENCES words(id),
  pos      text NOT NULL,
  count    int  NOT NULL,
  PRIMARY KEY (word_id, pos)
);

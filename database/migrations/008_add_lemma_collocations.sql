-- Adds lemma-pair cooccurrence, re-derived directly from the corpus
-- (tools/pos-tagging/extract_lemmas.py tallies adjacent-token lemma
-- pairs while scanning sentences.txt) rather than from Leipzig's
-- surface-form-keyed co_n.txt. See decision #44.
--
-- No `significance` column, unlike `collocations`: decision #43 already
-- moved ranking/filtering to logDice, computed from `cooccurrence` and
-- `lemma_frequency` at query time - there's no need to reinvent
-- Leipzig's significance formula at lemma granularity.

CREATE TABLE lemma_collocations (
  left_lemma_id  int NOT NULL REFERENCES lemmas(id),
  right_lemma_id int NOT NULL REFERENCES lemmas(id),
  cooccurrence   int NOT NULL,
  PRIMARY KEY (left_lemma_id, right_lemma_id)
);

CREATE INDEX idx_lemma_collocations_left ON lemma_collocations(left_lemma_id);
CREATE INDEX idx_lemma_collocations_right ON lemma_collocations(right_lemma_id);

-- Tables, not views - same reasoning and same measured problem as
-- word_dominant_lemma (007_add_lemmas.sql): both of these need to
-- GROUP BY lemma_id over word_dominant_lemma, a different key than
-- word_dominant_lemma's own primary key (word_id). Even with
-- idx_word_dominant_lemma_lemma_id in place, this is only reliable
-- when the planner chooses to use it - measured directly: in the same
-- query, one lemma_frequency lookup used the index (fast) while
-- another chose to fully materialize the aggregate instead (~1s just
-- for that one join). Rather than depend on a cost-based choice that
-- went two different ways for the identical view in one query,
-- these are precomputed once and indexed directly - populated by
-- database/scripts/load-lemmas.ts right after word_dominant_lemma.
CREATE TABLE lemma_dominant_pos (
  lemma_id int PRIMARY KEY REFERENCES lemmas(id),
  pos      text NOT NULL,
  count    int  NOT NULL,
  share    real NOT NULL
);

-- Sums the authoritative Leipzig-sourced words.frequency (not our own
-- word_lemmas.count, which is just an observed-occurrence tally from
-- our single-pass corpus scan) per lemma, via each word's one dominant
-- lemma assignment - the frequency term used in query-time logDice.
CREATE TABLE lemma_frequency (
  lemma_id  int PRIMARY KEY REFERENCES lemmas(id),
  frequency int NOT NULL
);

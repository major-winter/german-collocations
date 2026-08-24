-- Adds lemma vocabulary and a raw (surface form -> lemma) count table,
-- produced offline by tools/pos-tagging/extract_lemmas.py and loaded by
-- database/scripts/load-lemmas.ts.
--
-- Decision #44: lemmas aren't a Leipzig concept, so unlike `words.id`
-- (Leipzig's own IDs), `lemmas.id` is invented here via IDENTITY.
--
-- word_lemmas stores raw counts per (word, lemma) pair, not a
-- precomputed "the" lemma per word - exactly mirroring word_pos's
-- shape and reasoning (005_add_word_pos.sql): keeps any genuine
-- ambiguity visible and lets the dominance rule change later without
-- a re-tag, rather than baking in a single mapping up front.

CREATE TABLE lemmas (
  id    int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lemma text NOT NULL UNIQUE
);

CREATE TABLE word_lemmas (
  word_id  int NOT NULL REFERENCES words(id),
  lemma_id int NOT NULL REFERENCES lemmas(id),
  count    int NOT NULL,
  PRIMARY KEY (word_id, lemma_id)
);

-- NOT a view, unlike word_dominant_pos (006_add_word_dominant_pos_view.sql) -
-- measured with EXPLAIN before deciding, same as #006 did, and the
-- measurement went the other way here. word_dominant_pos is always
-- filtered by the same key it's DISTINCT ON'd by (word_id), which
-- Postgres can push down into an index scan. Decision #44's
-- lemma_frequency and lemma_dominant_pos both need to re-aggregate this
-- by lemma_id instead - a different key than word_id - which is NOT
-- push-down-able through a live DISTINCT ON: Postgres has to compute
-- every word's dominant lemma before it can group the result by
-- lemma_id, turning a single-lemma lookup into a full scan of all
-- ~716K words. Measured directly: this made a per-word collocation
-- query time out. A table with an index on lemma_id (in addition to
-- the word_id primary key) fixes this - populated once by
-- load-lemmas.ts right after word_lemmas, no drift risk in practice
-- since word_lemmas only ever changes via a full corpus reload
-- (decision #37), same as every other table in this schema.
CREATE TABLE word_dominant_lemma (
  word_id  int PRIMARY KEY REFERENCES words(id),
  lemma_id int NOT NULL REFERENCES lemmas(id),
  count    int NOT NULL,
  share    real NOT NULL
);

CREATE INDEX idx_word_dominant_lemma_lemma_id ON word_dominant_lemma(lemma_id);

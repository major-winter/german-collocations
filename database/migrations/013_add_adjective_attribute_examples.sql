-- Example sentences for adjective_attributes (migration 012), produced
-- by the same tools/pos-tagging/extract_adjective_attributes.py pass
-- that produces adjective_attribute.tsv - not collocation_examples
-- (decision #41), which only covers linearly-adjacent surface-form
-- pairs and can't distinguish an attributive "große Auto" from a
-- predicative "Auto ist groß" the way this table's own extraction
-- already does (see migration 012).
--
-- Same shape as verb_argument_examples (migration 011): no FK to a
-- shared `sentences` dedup table (sentence text stored directly, bounded
-- to 3 examples per (noun, adjective) pair by the extraction pass
-- itself), and a serial `id` primary key rather than a natural composite
-- key, since this table is always TRUNCATE + fully reloaded together
-- with adjective_attributes (same convention as decision #37/#44), never
-- incrementally upserted.
CREATE TABLE adjective_attribute_examples (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  noun_lemma_id      int  NOT NULL REFERENCES lemmas(id),
  adjective_lemma_id int  NOT NULL REFERENCES lemmas(id),
  sentence           text NOT NULL,
  noun_surface       text NOT NULL,
  adjective_surface  text NOT NULL
);

-- Queried from both directions: a noun headword's adjective section
-- (noun_lemma_id fixed) and an adjective headword's noun section
-- (adjective_lemma_id fixed).
CREATE INDEX idx_adjective_attribute_examples_noun
  ON adjective_attribute_examples(noun_lemma_id);
CREATE INDEX idx_adjective_attribute_examples_adjective
  ON adjective_attribute_examples(adjective_lemma_id);

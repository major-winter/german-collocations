-- Example sentences for verb_arguments (migration 010), produced by the
-- same tools/pos-tagging/extract_verb_arguments.py pass that produces
-- verb_argument.tsv - not collocation_examples (decision #41), which only
-- covers linearly-adjacent surface-form pairs and can't serve a subject/
-- object pair that's frequently far apart in the sentence (the entire
-- reason this feature needs a dependency parse - see migration 010).
--
-- No FK to a shared `sentences` table like collocation_examples has:
-- sentence text is stored directly. Simpler for a table with its own
-- standalone extraction pass and no other consumer of that dedup, and at
-- this scale (bounded to 3 examples per (verb, relation, argument)
-- triple) the duplication cost is small. A serial `id` is the primary
-- key rather than a natural composite key over (verb_lemma_id,
-- argument_lemma_id, grammatical_relation, sentence) - the TSV already
-- guarantees at most 3 distinct examples per triple (see
-- extract_verb_arguments.py's consider_candidate), and this table is
-- always TRUNCATE + fully reloaded together with verb_arguments (same
-- convention as decision #37/#44), never incrementally upserted, so
-- there's no need for a natural key to dedupe against on conflict.
CREATE TABLE verb_argument_examples (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  verb_lemma_id        int  NOT NULL REFERENCES lemmas(id),
  argument_lemma_id    int  NOT NULL REFERENCES lemmas(id),
  grammatical_relation text NOT NULL,
  sentence             text NOT NULL,
  verb_surface         text NOT NULL,
  argument_surface     text NOT NULL
);

-- Queried from both directions: a verb headword's noun section
-- (verb_lemma_id + grammatical_relation fixed) and a noun headword's
-- verb section (argument_lemma_id + grammatical_relation fixed).
CREATE INDEX idx_verb_argument_examples_verb
  ON verb_argument_examples(verb_lemma_id, grammatical_relation);
CREATE INDEX idx_verb_argument_examples_argument
  ON verb_argument_examples(argument_lemma_id, grammatical_relation);

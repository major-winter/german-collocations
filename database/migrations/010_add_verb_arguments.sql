-- Verb subject/object arguments, produced offline by
-- tools/pos-tagging/extract_verb_arguments.py (spaCy dependency parse,
-- not plain adjacency - see that script's module docstring for why:
-- German subjects/objects routinely sit far from their verb, and
-- passive/perfect/modal auxiliary stacking needs real disambiguation,
-- not just distance) and loaded by
-- database/scripts/load-verb-arguments.ts. Additive: `words`,
-- `collocations`, and `lemma_collocations` are untouched.
--
-- This is the first step of decision #53 (docs/decisions-53.md):
-- replacing lemma_collocations' plain-adjacency noun/verb sections with
-- grammar-based data, one relation at a time. It replaces, for a verb
-- headword, the "noun" section (now sourced from this table's
-- verb_lemma_id side) and, for a noun headword, the "verb" section (now
-- sourced from this table's argument_lemma_id side) - see
-- CollocationRepository.ts.
--
-- grammatical_relation is part of the primary key, same reasoning as
-- verb_prepositions.grammatical_case: the same (verb, argument) pair can
-- legitimately be both a Subjekt in one sentence and an Akkusativobjekt
-- in another (e.g. "die Regierung unterstuetzt" vs. "man unterstuetzt
-- die Regierung"), and collapsing that into one row would hide a real
-- grammatical distinction the same way word_lemmas/word_pos
-- deliberately don't collapse theirs.
--
-- No `significance`/logDice column, same reasoning as
-- verb_prepositions: ranking is share of the verb's own total argument
-- count (computed at query time from `count`), a different, smaller
-- population than lemma_collocations' raw adjacency.
CREATE TABLE verb_arguments (
  verb_lemma_id     int  NOT NULL REFERENCES lemmas(id),
  argument_lemma_id int  NOT NULL REFERENCES lemmas(id),
  grammatical_relation text NOT NULL,  -- 'Subjekt' | 'Akkusativobjekt' | 'Dativobjekt' | 'Genitivobjekt'
  count             int  NOT NULL,
  PRIMARY KEY (verb_lemma_id, argument_lemma_id, grammatical_relation)
);

CREATE INDEX idx_verb_arguments_verb ON verb_arguments(verb_lemma_id);

-- Unlike verb_prepositions (only ever queried by verb_lemma_id, for the
-- Rektion callout on a verb's own page), this table is queried in both
-- directions: a verb headword's noun section by verb_lemma_id, and a
-- noun headword's verb section by argument_lemma_id - the reverse
-- lookup this index is for.
CREATE INDEX idx_verb_arguments_argument ON verb_arguments(argument_lemma_id);

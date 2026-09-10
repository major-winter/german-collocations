-- Attributive adjective-noun relations, produced offline by
-- tools/pos-tagging/extract_adjective_attributes.py (spaCy dependency
-- parse - see that script's module docstring for why plain adjacency
-- can't distinguish "das große Auto" from "das Auto ist groß" or from
-- an unrelated adjective that just happens to sit next to the noun) and
-- loaded by database/scripts/load-adjective-attributes.ts. Additive:
-- `words`, `collocations`, and `lemma_collocations` are untouched.
--
-- Second grammar-based relation after decision #53 (verb subject/
-- object): replaces, for a noun headword, the "adjective" section (now
-- sourced from this table's adjective_lemma_id side) and, for an
-- adjective headword, the "noun" section (now sourced from this
-- table's noun_lemma_id side) - see CollocationRepository.ts.
--
-- Unlike verb_arguments/verb_prepositions, there's no grammatical_relation
-- or grammatical_case column: a (noun, adjective) pair can't legitimately
-- mean two different things the way (verb, argument) can (Subjekt vs.
-- Akkusativobjekt) - attributive modification is the only relation this
-- extraction captures (predicative uses are excluded at the extraction
-- step, see the Python script's docstring).
--
-- No `significance`/logDice column, same reasoning as verb_arguments:
-- ranking is share of the noun's (or adjective's) own total count,
-- computed at query time from `count`, a different, smaller population
-- than lemma_collocations' raw adjacency.
CREATE TABLE adjective_attributes (
  noun_lemma_id      int NOT NULL REFERENCES lemmas(id),
  adjective_lemma_id int NOT NULL REFERENCES lemmas(id),
  count               int NOT NULL,
  PRIMARY KEY (noun_lemma_id, adjective_lemma_id)
);

CREATE INDEX idx_adjective_attributes_noun ON adjective_attributes(noun_lemma_id);

-- Queried in both directions, same reasoning as verb_arguments: a noun
-- headword's adjective section by noun_lemma_id, and an adjective
-- headword's noun section by adjective_lemma_id - the reverse lookup
-- this index is for.
CREATE INDEX idx_adjective_attributes_adjective ON adjective_attributes(adjective_lemma_id);

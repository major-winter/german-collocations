-- Governed verb-preposition pairs (Rektion), produced offline by
-- tools/pos-tagging/extract_verb_prepositions.py (spaCy dependency parse,
-- not plain adjacency - see that script's module docstring for why plain
-- lemma_collocations adjacency isn't reliable enough for this) and loaded
-- by database/scripts/load-verb-prepositions.ts. Additive: `words`,
-- `collocations`, and `lemma_collocations` are untouched.
--
-- grammatical_case is part of the primary key, not a side column to
-- dedupe away: two-way prepositions (an/auf/in/ueber/unter/vor/zwischen/
-- neben) legitimately govern different cases for different verbs (and
-- occasionally different senses of the same verb, e.g. "bestehen auf" +
-- Dativ vs. "bestehen in" + Dativ are two distinct senses worth keeping
-- as separate rows), so collapsing case into `count` would hide real
-- ambiguity the same way word_lemmas/word_pos deliberately don't collapse
-- theirs.
--
-- No `significance`/logDice column: ranking here is share of the verb's
-- own total attached-PP count (computed at query time from `count`), not
-- logDice against corpus-wide frequency - a different, smaller population
-- (syntactically-attached PPs only) than lemma_collocations' raw
-- adjacency, so logDice's frequency-normalization doesn't apply the same
-- way. See tools/pos-tagging/extract_verb_prepositions.py's docstring for
-- the empirical comparison that motivated this.

-- grammatical_case is NOT NULL with '' meaning "unresolved" (matching the
-- TSV's own empty-field convention), not nullable - a PRIMARY KEY column
-- can't hold NULL in Postgres, and grammatical_case has to be part of the
-- key (see above), so this sidesteps that rather than reaching for
-- NULLS NOT DISTINCT for a case this simple.
CREATE TABLE verb_prepositions (
  verb_lemma_id        int  NOT NULL REFERENCES lemmas(id),
  preposition_lemma_id int  NOT NULL REFERENCES lemmas(id),
  grammatical_case      text NOT NULL,  -- 'Nominativ' | 'Genitiv' | 'Dativ' | 'Akkusativ' | '' if unresolved
  count                 int  NOT NULL,
  PRIMARY KEY (verb_lemma_id, preposition_lemma_id, grammatical_case)
);

CREATE INDEX idx_verb_prepositions_verb ON verb_prepositions(verb_lemma_id);

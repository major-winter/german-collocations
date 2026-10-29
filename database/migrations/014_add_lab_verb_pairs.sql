-- Verb-noun pairs from the sister repo collocation-lab (decision #60,
-- docs/decisions.md): pairs of a verb with its object (obj), with a
-- prepositional noun (obl, e.g. "zur Verfügung stellen") and with its
-- subject (nsubj), parsed by Stanza over Leipzig news + wiki + web (3M
-- sentences) and ranked by log-likelihood. Written by `colloc export`
-- and loaded by database/scripts/load-lab-verb-pairs.ts. They replace
-- verb_arguments (migration 010) on noun and verb pages.
--
-- Keyed by lemma text, not lemmas.id: the lab's lemmas are the
-- authority here, and mapping them onto `lemmas` would bring back the
-- broken spaCy lemmas ("Spielt", "leistn") that decision #60 is about.
-- The backend matches the searched word, then its dominant lemma's
-- text, against `noun` or `verb`.
--
-- prep is '' unless relation = 'obl'. phrase_noun is how the noun
-- phrase is most often written for obl pairs ("in der Kritik"), and the
-- noun itself otherwise. score is the signed LL; only positive scores
-- are exported.
CREATE TABLE lab_verb_pairs (
  relation text NOT NULL CHECK (relation IN ('obj', 'obl', 'nsubj')),
  verb text NOT NULL,
  prep text NOT NULL,
  noun text NOT NULL,
  phrase_noun text NOT NULL,
  score real NOT NULL,
  pair_freq integer NOT NULL,
  PRIMARY KEY (relation, verb, prep, noun)
);

-- A noun page looks pairs up by noun, a verb page by verb.
CREATE INDEX idx_lab_verb_pairs_noun ON lab_verb_pairs(noun);
CREATE INDEX idx_lab_verb_pairs_verb ON lab_verb_pairs(verb);

-- Up to three example sentences per pair, rank 1 first. The surfaces
-- are the verb and noun as written in that sentence, for highlighting.
-- No FK to lab_verb_pairs: the loader replaces both tables together in
-- one transaction.
CREATE TABLE lab_verb_pair_examples (
  relation text NOT NULL,
  verb text NOT NULL,
  prep text NOT NULL,
  noun text NOT NULL,
  rank smallint NOT NULL,
  sentence text NOT NULL,
  verb_surface text NOT NULL,
  noun_surface text NOT NULL,
  PRIMARY KEY (relation, verb, prep, noun, rank)
);

-- The article of each collocation-lab noun (decision #69, docs/decisions.md;
-- design in docs/superpowers/specs/2026-11-26-surface-chunks-design.md).
-- Written by `colloc export` as lab_noun_genders.tsv and loaded by
-- database/scripts/load-lab-verb-pairs.ts in the same transaction as
-- lab_verb_pairs, whose `noun` it is keyed by (lemma text, like #60).
--
-- A noun has a row only when at least 5 nominative singular definite uses
-- agree on one article at 90% or more: no row means "unknown", and the
-- app then shows the noun without an article.
CREATE TABLE lab_noun_genders (
  noun text PRIMARY KEY,
  article text NOT NULL CHECK (article IN ('der', 'die', 'das'))
);

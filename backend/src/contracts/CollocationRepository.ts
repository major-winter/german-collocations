import { CollocationEntry, CollocationSection, GovernedPreposition } from "@collocations/types";

export interface CollocationRow {
  leftLemmaId: number;
  rightLemmaId: number;
  word: string;
  cooccurrence: number;
  significance: number;
  sentence: string | null;
  leftWord: string | null;
  rightWord: string | null;
  section: CollocationSection;
}

// Rows from verb_arguments (decision #53, docs/decisions-53.md): unlike
// CollocationRow's symmetric left/right shape (either side can be the
// queried lemma), a verb_arguments row always has a fixed verb side and
// argument side - verbLemmaId/argumentLemmaId, not left/right.
export interface VerbArgumentRow {
  verbLemmaId: number;
  argumentLemmaId: number;
  word: string;
  cooccurrence: number;
  significance: number;
  relation: string;
  sentence: string | null;
  verbSurface: string | null;
  argumentSurface: string | null;
  section: CollocationSection;
}

// Rows from adjective_attributes (decision #54, docs/decisions-54.md):
// same fixed-side shape as VerbArgumentRow, not CollocationRow's
// symmetric left/right - a row always has a fixed noun side and
// adjective side. No `relation` field, unlike VerbArgumentRow: a (noun,
// adjective) pair only ever means one thing (attributive modification),
// so there's nothing to disambiguate.
export interface AdjectiveAttributeRow {
  nounLemmaId: number;
  adjectiveLemmaId: number;
  word: string;
  cooccurrence: number;
  significance: number;
  sentence: string | null;
  nounSurface: string | null;
  adjectiveSurface: string | null;
  section: CollocationSection;
}

export interface CollocationLookup {
  wordId: number;
  collocations: CollocationEntry[];
  governedPrepositions: GovernedPreposition[];
}

export interface CollocationRepository {
  findByWord(word: string): Promise<CollocationLookup | null>;
}

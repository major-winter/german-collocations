import type {
  CollocationEntry,
  CollocationSection,
  GovernedPreposition,
  VerbNounPairs,
  VerbNounRelation,
} from "@collocations/types";

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

// Rows from verb_arguments (decision #53, docs/decisions.md): unlike
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

// Rows from adjective_attributes (decision #54, docs/decisions.md):
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

// Rows from lab_verb_pairs joined with lab_verb_pair_examples (decision
// #60, docs/decisions.md): one row per example, or one row with null
// example fields for a pair without examples. Keyed by lemma text.
export interface LabVerbPairRow {
  relation: VerbNounRelation;
  verb: string;
  prep: string;
  noun: string;
  phraseNoun: string;
  score: number;
  pairFreq: number;
  sentence: string | null;
  verbSurface: string | null;
  nounSurface: string | null;
}

export interface CollocationLookup {
  wordId: number;
  collocations: CollocationEntry[];
  governedPrepositions: GovernedPreposition[];
  verbNounPairs: VerbNounPairs | null;
}

export interface CollocationRepository {
  findByWord(word: string): Promise<CollocationLookup | null>;
}

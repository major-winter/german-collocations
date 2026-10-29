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

// Rows from adjective_attributes (decision #54, docs/decisions.md):
// unlike CollocationRow's symmetric left/right shape, a row always has
// a fixed noun side and adjective side.
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

import { CollocationEntry, CollocationSection } from "@collocations/types";

export interface CollocationRow {
  leftLemmaId: number;
  rightLemmaId: number;
  word: string;
  cooccurrence: number;
  significance: number;
  sentence: string | null;
  section: CollocationSection;
}

export interface CollocationLookup {
  wordId: number;
  collocations: CollocationEntry[];
}

export interface CollocationRepository {
  findByWord(word: string): Promise<CollocationLookup | null>;
}

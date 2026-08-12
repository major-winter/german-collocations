import { CollocationEntry } from "@collocations/types";

export interface CollocationRow {
  word: string;
  cooccurrence: number;
  significance: number;
  sentence: string | null;
}

export interface CollocationLookup {
  wordId: number;
  followedBy: CollocationEntry[];
  precededBy: CollocationEntry[];
}

export interface CollocationRepository {
  findByWord(word: string): Promise<CollocationLookup | null>;
}

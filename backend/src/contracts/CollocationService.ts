import type { CollocationEntry, GovernedPreposition, VerbNounPairs } from "@collocations/types";
import type { CollocationRow } from "./CollocationRepository.ts";

export interface CollocationResult {
  word: string;
  collocations: CollocationEntry[];
  governedPrepositions: GovernedPreposition[];
  verbNounPairs: VerbNounPairs | null;
}

export interface CollocationService {
  getCollocations(word: string): Promise<CollocationResult | null>;
}

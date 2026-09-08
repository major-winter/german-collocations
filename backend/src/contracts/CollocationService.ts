import { CollocationEntry, GovernedPreposition } from "@collocations/types";
import type { CollocationRow } from "./CollocationRepository.ts";

export interface CollocationResult {
  word: string;
  collocations: CollocationEntry[];
  governedPrepositions: GovernedPreposition[];
}

export interface CollocationService {
  getCollocations(word: string): Promise<CollocationResult | null>;
}

import type { CollocationRow } from "./CollocationRepository.ts";

export interface CollocationResult {
  word: string;
  followedBy: CollocationRow[];
  precededBy: CollocationRow[];
}

export interface CollocationService {
  getCollocations(word: string): Promise<CollocationResult | null>;
}

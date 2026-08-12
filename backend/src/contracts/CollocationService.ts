import { CollocationEntry } from "@collocations/types";
import type { CollocationRow } from "./CollocationRepository.ts";

export interface CollocationResult {
  word: string;
  followedBy: CollocationEntry[];
  precededBy: CollocationEntry[];
}

export interface CollocationService {
  getCollocations(word: string): Promise<CollocationResult | null>;
}

import type { GovernedPreposition } from "@collocations/types";
import type {
  AdjacencyRow,
  AdjectiveAttributeRow,
  LabVerbPairRow,
} from "../../../domain/collocations.ts";
import type { PageSide } from "../../../domain/verbNounPhrases.ts";

// Driven (outbound) port: everything the collocation use case needs from
// storage, phrased in domain terms. The Postgres adapter implements it;
// tests implement it in memory.

export interface DominantLemma {
  id: number;
  text: string;
}

export interface CollocationStore {
  findWordId(word: string): Promise<number | null>;
  findDominantLemma(wordId: number): Promise<DominantLemma | null>;
  findDominantPos(wordId: number): Promise<string | null>;
  findAdjacencyCollocations(lemmaId: number): Promise<AdjacencyRow[]>;
  findAdjectiveAttributes(lemmaId: number): Promise<AdjectiveAttributeRow[]>;
  findGovernedPrepositions(lemmaId: number): Promise<GovernedPreposition[]>;
  findLabVerbPairs(side: PageSide, lemma: string): Promise<LabVerbPairRow[]>;
}

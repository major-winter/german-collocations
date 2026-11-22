import type { CollocationEntry } from "@collocations/types";
import type { LabVerbPair } from "../../../domain/collocations.ts";
import type { PageSide } from "../../../domain/verbNounPhrases.ts";

// Driven (outbound) port: everything the collocation use case needs from
// storage, phrased in domain terms. Results come back grouped, with their
// examples attached; how storage lays out rows stays behind the seam
// (decision #68). The Postgres adapter implements it; tests implement it
// in memory.

export interface Headword {
  /** The word's dominant lemma; null when the lemma scan never produced one. */
  lemma: { id: number; text: string } | null;
  /** The word's dominant part of speech (e.g. "NOUN"), if tagged. */
  pos: string | null;
}

export interface CollocationStore {
  /** null when the corpus doesn't have the word at all. */
  resolveHeadword(word: string): Promise<Headword | null>;
  /** Adjacent-word partners, best per word class; examples name the searched lemma's surface form first. */
  findAdjacencyCollocations(lemmaId: number): Promise<CollocationEntry[]>;
  /** Attributive adjective–noun partners (decision #54), from whichever side the lemma is on. */
  findAdjectiveAttributes(lemmaId: number): Promise<CollocationEntry[]>;
  /** Collocation-lab pairs for a lemma text on one side (decision #60), best per relation. */
  findLabVerbPairs(side: PageSide, lemma: string): Promise<LabVerbPair[]>;
}

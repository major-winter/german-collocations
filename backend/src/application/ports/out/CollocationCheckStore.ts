import type { CheckPair, VerbCandidate } from "../../../domain/collocationCheck.ts";
import type { Headword } from "./CollocationStore.ts";

// Driven (outbound) port for the collocation check (#70). Narrow on
// purpose, next to CollocationStore rather than widening it (#68).
export interface CollocationCheckStore {
  /** null when the corpus doesn't have the word at all. */
  resolveHeadword(word: string): Promise<Headword | null>;
  /** The lab verb lemmas a typed verb form stands for, with how often (#70). */
  findVerbCandidates(surface: string): Promise<VerbCandidate[]>;
  /** All of a noun's lab object pairs, best-first. */
  findObjectPairs(noun: string): Promise<CheckPair[]>;
}

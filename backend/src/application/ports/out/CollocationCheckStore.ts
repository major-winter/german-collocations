import type { AdjectiveCounts, WrittenForm } from "../../../domain/adjectiveCheck.ts";
import type { CheckPair, VerbCandidate } from "../../../domain/collocationCheck.ts";
import type { Headword } from "./CollocationStore.ts";

/** An adjective lemma that has attributive data (#54). */
export interface AdjectiveLemma {
  id: number;
  lemma: string;
  /** Whether the typed form is mostly tagged ADJ ("bekannte" yes, though also "bekennen"; "macht" no). */
  mostlyAdjective: boolean;
}

// Driven (outbound) port for the collocation check (#70, #74). Narrow on
// purpose, next to CollocationStore rather than widening it (#68).
export interface CollocationCheckStore {
  /** null when the corpus doesn't have the word at all. */
  resolveHeadword(word: string): Promise<Headword | null>;
  /** The lab verb lemmas a typed verb form stands for, with how often (#70). */
  findVerbCandidates(surface: string): Promise<VerbCandidate[]>;
  /** All of a noun's lab object pairs, best-first. */
  findObjectPairs(noun: string): Promise<CheckPair[]>;
  /** The attributive lemma a lowercase typed form stands for, null when none of its lemmas is one (#74). */
  findAdjectiveLemma(surface: string): Promise<AdjectiveLemma | null>;
  /** The noun's attributive total and its frequent pairs plus the typed adjective's, with the adjectives' totals (#74). */
  findAdjectiveCounts(nounLemmaId: number, adjectiveLemmaId: number): Promise<AdjectiveCounts>;
  /** The written forms of each given pair, from its examples, with how many use each (#74). */
  findWrittenForms(nounLemmaId: number, adjectiveLemmaIds: number[]): Promise<WrittenForm[]>;
}

import type {
  CollocationEntry,
  CollocationSection,
  VerbNounPair,
  VerbNounRelation,
} from "@collocations/types";
import { chipOf, phraseNounWord, phraseOf, type PageSide } from "./verbNounPhrases.ts";

// The domain core: plain data in, plain data out. No SQL, no Express.

// A collocation-lab pair (decision #60) as storage knows it: lemma text
// on both sides, examples in rank order. Turned into what the learner
// sees by toVerbNounPairs below.
export interface LabVerbPair {
  relation: VerbNounRelation;
  verb: string;
  prep: string;
  noun: string;
  phraseNoun: string;
  nounArticle: string | null; // der/die/das, or null when the lab doesn't know (#69)
  score: number;
  pairFreq: number;
  examples: { sentence: string; verbSurface: string; nounSurface: string }[];
}

/** The lab pairs as the learner sees them: a chip, a phrase, and examples with the searched side first. */
export function toVerbNounPairs(pairs: LabVerbPair[], side: PageSide): VerbNounPair[] {
  return pairs.map((pair) => ({
    relation: pair.relation,
    partner: side === "noun" ? pair.verb : pair.noun,
    chip: chipOf(side, pair.relation, pair.verb, pair.phraseNoun, pair.noun, pair.nounArticle),
    chipArticle: side === "verb" && pair.relation !== "obl" ? pair.nounArticle : null,
    phrase: phraseOf(pair.relation, pair.verb, pair.phraseNoun, pair.noun),
    phraseNoun: phraseNounWord(pair.phraseNoun),
    score: pair.score,
    frequency: pair.pairFreq,
    examples: pair.examples.map((example) => ({
      sentence: example.sentence,
      searchWord: side === "noun" ? example.nounSurface : example.verbSurface,
      collocateWord: side === "noun" ? example.verbSurface : example.nounSurface,
    })),
  }));
}

/**
 * Sections adjective_attributes actually produced data for replace the
 * lemma_collocations-sourced section entirely (decision #54). Decision
 * #60: on a noun page the "verb" section, and on a verb page the "noun"
 * section, is the lab pairs' alone - the adjacency one never shows, even
 * when the lab has nothing for this word.
 */
export function mergeSections(
  adjacencyEntries: CollocationEntry[],
  attributeEntries: CollocationEntry[],
  side: PageSide | null,
): CollocationEntry[] {
  const supersededSections = new Set<CollocationSection>(
    attributeEntries.map((e) => e.section),
  );
  if (side === "noun") supersededSections.add("verb");
  if (side === "verb") supersededSections.add("noun");
  return [
    ...adjacencyEntries.filter((entry) => !supersededSections.has(entry.section)),
    ...attributeEntries,
  ];
}

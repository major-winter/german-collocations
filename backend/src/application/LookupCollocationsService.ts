import type { CollocationResponse, VerbNounPairs } from "@collocations/types";
import {
  groupAdjacencyRows,
  groupAdjectiveAttributeRows,
  groupLabVerbPairRows,
  mergeSections,
} from "../domain/collocations.ts";
import { lookupCandidates, pageSide, type PageSide } from "../domain/verbNounPhrases.ts";
import type { CollocationStore } from "./ports/out/CollocationStore.ts";
import type { LookupCollocations } from "./ports/in/LookupCollocations.ts";

export class LookupCollocationsService implements LookupCollocations {
  #store: CollocationStore;
  constructor(store: CollocationStore) {
    this.#store = store;
  }

  async lookup(word: string): Promise<CollocationResponse | null> {
    const wordId = await this.#store.findWordId(word);
    if (wordId === null) return null;

    // A word can be missing a lemma mapping if extract_lemmas.py's
    // corpus scan never produced a row for it - degrade to an empty
    // result rather than erroring. The lab pairs below still get looked
    // up by the word itself.
    const [lemma, pos] = await Promise.all([
      this.#store.findDominantLemma(wordId),
      this.#store.findDominantPos(wordId),
    ]);

    const side = pageSide(pos);
    const verbNounPairs = side
      ? await this.#findLabVerbPairs(side, word, lemma?.text ?? null)
      : null;

    if (!lemma) {
      return { word, collocations: [], governedPrepositions: [], verbNounPairs };
    }

    const [adjacencyRows, attributeRows, governedPrepositions] = await Promise.all([
      this.#store.findAdjacencyCollocations(lemma.id),
      this.#store.findAdjectiveAttributes(lemma.id),
      this.#store.findGovernedPrepositions(lemma.id),
    ]);

    const collocations = mergeSections(
      groupAdjacencyRows(adjacencyRows, lemma.id),
      groupAdjectiveAttributeRows(attributeRows, lemma.id),
      side,
    );

    return { word, collocations, governedPrepositions, verbNounPairs };
  }

  // Decision #60: the searched word first, then its dominant lemma's
  // text; the first that has any lab pairs on this side wins.
  async #findLabVerbPairs(
    side: PageSide,
    word: string,
    lemmaText: string | null,
  ): Promise<VerbNounPairs> {
    const candidates = lookupCandidates(word, lemmaText);
    for (const candidate of candidates) {
      const rows = await this.#store.findLabVerbPairs(side, candidate);
      if (rows.length > 0) {
        return { side, lemma: candidate, pairs: groupLabVerbPairRows(rows, side) };
      }
    }
    return { side, lemma: candidates[candidates.length - 1], pairs: [] };
  }
}

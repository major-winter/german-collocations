import type { CollocationResponse, VerbNounPairs } from "@collocations/types";
import { mergeSections, toVerbNounPairs } from "../domain/collocations.ts";
import { lookupCandidates, pageSide, type PageSide } from "../domain/verbNounPhrases.ts";
import type { CollocationStore } from "./ports/out/CollocationStore.ts";
import type { LookupCollocations } from "./ports/in/LookupCollocations.ts";

export class LookupCollocationsService implements LookupCollocations {
  #store: CollocationStore;
  constructor(store: CollocationStore) {
    this.#store = store;
  }

  async lookup(word: string): Promise<CollocationResponse | null> {
    const headword = await this.#store.resolveHeadword(word);
    if (headword === null) return null;

    // A word can be missing a lemma mapping if extract_lemmas.py's
    // corpus scan never produced a row for it - degrade to an empty
    // result rather than erroring. The lab pairs below still get looked
    // up by the word itself.
    const { lemma, pos } = headword;
    const side = pageSide(pos);
    const verbNounPairs = side
      ? await this.#findLabVerbPairs(side, word, lemma?.text ?? null)
      : null;

    if (!lemma) {
      return { word, collocations: [], verbNounPairs };
    }

    const [adjacencyEntries, attributeEntries] = await Promise.all([
      this.#store.findAdjacencyCollocations(lemma.id),
      this.#store.findAdjectiveAttributes(lemma.id),
    ]);

    const collocations = mergeSections(adjacencyEntries, attributeEntries, side);
    return { word, collocations, verbNounPairs };
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
      const pairs = await this.#store.findLabVerbPairs(side, candidate);
      if (pairs.length > 0) {
        // On a noun page every pair's noun is the headword (#69).
        const article = side === "noun" ? pairs[0].nounArticle : null;
        return { side, lemma: candidate, article, pairs: toVerbNounPairs(pairs, side) };
      }
    }
    return { side, lemma: candidates[candidates.length - 1], article: null, pairs: [] };
  }
}

import type { LemmaSuggestion } from "@collocations/types";
import type { LemmaIndex } from "./ports/out/LemmaIndex.ts";
import type { SuggestLemmas } from "./ports/in/SuggestLemmas.ts";

const MIN_PREFIX_LENGTH = 2;
const MAX_SUGGESTIONS = 6;

export class SuggestLemmasService implements SuggestLemmas {
  #index: LemmaIndex;
  constructor(index: LemmaIndex) {
    this.#index = index;
  }

  async suggest(prefix: string): Promise<LemmaSuggestion[]> {
    const trimmed = prefix.trim();
    if (trimmed.length < MIN_PREFIX_LENGTH) return [];
    return this.#index.suggest(trimmed, MAX_SUGGESTIONS);
  }
}

import type { WordSuggestion } from "@collocations/types";
import type { WordIndex } from "./ports/WordIndex.ts";
import type { SearchWords } from "./ports/useCases.ts";

export class SearchWordsService implements SearchWords {
  #index: WordIndex;
  constructor(index: WordIndex) {
    this.#index = index;
  }

  async search(query: string): Promise<WordSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    return this.#index.search(trimmed, 10);
  }
}

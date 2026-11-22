import type { WordSuggestion } from "@collocations/types";

// Driven (outbound) port: fuzzy word lookup.
export interface WordIndex {
  search(query: string, limit: number): Promise<WordSuggestion[]>;
}

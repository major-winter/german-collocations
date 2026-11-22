import type { WordSuggestion } from "@collocations/types";

// Driving (inbound) port: fuzzy word suggestions for the search box.
export interface SearchWords {
  search(query: string): Promise<WordSuggestion[]>;
}

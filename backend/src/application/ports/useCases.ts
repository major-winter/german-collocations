import type { CollocationResponse, WordSuggestion } from "@collocations/types";

// Driving (inbound) ports: what the outside world - today the HTTP
// adapter - may ask the application to do.

export interface LookupCollocations {
  lookup(word: string): Promise<CollocationResponse | null>;
}

export interface SearchWords {
  search(query: string): Promise<WordSuggestion[]>;
}

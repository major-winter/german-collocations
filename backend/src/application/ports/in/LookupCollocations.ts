import type { CollocationResponse } from "@collocations/types";

// Driving (inbound) port: what the outside world - today the HTTP
// adapter - may ask the application about a word's collocations.
export interface LookupCollocations {
  lookup(word: string): Promise<CollocationResponse | null>;
}

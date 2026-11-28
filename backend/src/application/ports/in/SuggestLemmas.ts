import type { LemmaSuggestion } from "@collocations/types";

// Driving (inbound) port: lemma suggestions for a typed prefix (#85).
export interface SuggestLemmas {
  suggest(prefix: string): Promise<LemmaSuggestion[]>;
}

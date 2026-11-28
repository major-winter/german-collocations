import type { LemmaSuggestion } from "@collocations/types";

// Driven (outbound) port: lemmas that start with, or have a form that
// starts with, a typed prefix; best first (#85).
export interface LemmaIndex {
  suggest(prefix: string, limit: number): Promise<LemmaSuggestion[]>;
}

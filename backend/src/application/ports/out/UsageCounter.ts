// Driven (outbound) port: anonymous per-day usage counts (#72). Nothing
// that identifies a visitor ever reaches it - only what kind of request.
// "check" stays the verb check (#70) only, so the A0 baseline is comparable
// across #74, which counts adjective checks as "check_adj".
export type UsageKind = "word_page" | "check" | "check_adj";

export interface UsageCounter {
  record(kind: UsageKind): Promise<void>;
}

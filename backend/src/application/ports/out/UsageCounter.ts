// Driven (outbound) port: anonymous per-day usage counts (#72). Nothing
// that identifies a visitor ever reaches it - only what kind of request.
export type UsageKind = "word_page" | "check";

export interface UsageCounter {
  record(kind: UsageKind): Promise<void>;
}

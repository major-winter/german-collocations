import type { CollocationCheck, CollocationResponse } from "@collocations/types";
import type { CheckCollocation } from "./ports/in/CheckCollocation.ts";
import type { LookupCollocations } from "./ports/in/LookupCollocations.ts";
import type { UsageCounter, UsageKind } from "./ports/out/UsageCounter.ts";

// Decision #72: anonymous per-day usage counts, the baseline #71's gates
// are set against. The decorators wrap the real use cases; counting is
// fire-and-forget, so a failed or slow count never touches the response.

interface ErrorLog {
  error(...args: unknown[]): void;
}

function countInBackground(counter: UsageCounter, kind: UsageKind, log: ErrorLog): void {
  counter.record(kind).catch((err) => log.error(`Error counting ${kind}:`, err));
}

export class CountingLookupCollocations implements LookupCollocations {
  #inner: LookupCollocations;
  #counter: UsageCounter;
  #log: ErrorLog;

  constructor(inner: LookupCollocations, counter: UsageCounter, log: ErrorLog = console) {
    this.#inner = inner;
    this.#counter = counter;
    this.#log = log;
  }

  async lookup(word: string): Promise<CollocationResponse | null> {
    const result = await this.#inner.lookup(word);
    if (result) countInBackground(this.#counter, "word_page", this.#log);
    return result;
  }
}

export class CountingCheckCollocation implements CheckCollocation {
  #inner: CheckCollocation;
  #counter: UsageCounter;
  #log: ErrorLog;

  constructor(inner: CheckCollocation, counter: UsageCounter, log: ErrorLog = console) {
    this.#inner = inner;
    this.#counter = counter;
    this.#log = log;
  }

  async check(q: string): Promise<CollocationCheck> {
    const result = await this.#inner.check(q);
    if (result.parsed) countInBackground(this.#counter, "check", this.#log);
    return result;
  }
}

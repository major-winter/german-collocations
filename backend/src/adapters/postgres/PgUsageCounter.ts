import { Pool } from "pg";
import type { UsageCounter, UsageKind } from "../../application/ports/out/UsageCounter.ts";

// Driven adapter: one upsert per counted request into usage_counts (#72).
// The day is the Berlin calendar day, computed by Postgres.
export class PgUsageCounter implements UsageCounter {
  #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async record(kind: UsageKind): Promise<void> {
    await this.#pool.query(
      `
INSERT INTO usage_counts (day, kind, count)
VALUES ((now() AT TIME ZONE 'Europe/Berlin')::date, $1, 1)
ON CONFLICT (day, kind) DO UPDATE SET count = usage_counts.count + 1;
`,
      [kind],
    );
  }
}

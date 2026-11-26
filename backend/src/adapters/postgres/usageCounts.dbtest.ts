import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PgUsageCounter } from "./PgUsageCounter.ts";
import { openTestDatabase } from "./testDatabase.ts";

// Decision #72: per-day usage counts against a real Postgres (#67).

const db = await openTestDatabase();
const counter = new PgUsageCounter(db.pool);

beforeEach(() => db.reset());
after(() => db.close());

async function rows() {
  const { rows } = await db.pool.query<{ day: string; kind: string; count: number }>(
    "SELECT day::text, kind, count FROM usage_counts ORDER BY kind",
  );
  return rows;
}

test("the same kind on the same day adds up; kinds are separate rows", async () => {
  await counter.record("word_page");
  await counter.record("word_page");
  await counter.record("check");
  const today = (await db.pool.query<{ d: string }>("SELECT (now() AT TIME ZONE 'Europe/Berlin')::date::text AS d")).rows[0].d;
  assert.deepEqual(await rows(), [
    { day: today, kind: "check", count: 1 },
    { day: today, kind: "word_page", count: 2 },
  ]);
});

test("concurrent counts are not lost", async () => {
  await Promise.all(Array.from({ length: 20 }, () => counter.record("check")));
  assert.equal((await rows())[0].count, 20);
});

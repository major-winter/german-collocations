import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollocationCheck, CollocationResponse } from "@collocations/types";
import type { UsageCounter, UsageKind } from "./ports/out/UsageCounter.ts";
import { CountingCheckCollocation, CountingLookupCollocations } from "./CountingUseCases.ts";

function recorder(behaviour: "ok" | "reject" | "hang" = "ok") {
  const kinds: UsageKind[] = [];
  const counter: UsageCounter = {
    record: (kind) => {
      kinds.push(kind);
      if (behaviour === "reject") return Promise.reject(new Error("db down"));
      if (behaviour === "hang") return new Promise(() => {});
      return Promise.resolve();
    },
  };
  return { counter, kinds };
}

const found = { word: "Frage" } as unknown as CollocationResponse;
const parsed = { parsed: true } as unknown as CollocationCheck;

const quiet = { error: () => {} };

test("a found word page is counted once; a missing one is not", async () => {
  const { counter, kinds } = recorder();
  const lookup = new CountingLookupCollocations({ lookup: async (w) => (w === "Frage" ? found : null) }, counter, quiet);
  assert.equal(await lookup.lookup("Frage"), found);
  assert.equal(await lookup.lookup("zzz"), null);
  assert.deepEqual(kinds, ["word_page"]);
});

test("a parsed check is counted once; an unparsed one is not", async () => {
  const { counter, kinds } = recorder();
  const check = new CountingCheckCollocation(
    { check: async (q) => (q === "Sport machen" ? parsed : { parsed: false }) },
    counter,
    quiet,
  );
  assert.equal(await check.check("Sport machen"), parsed);
  assert.deepEqual(await check.check("Hallo"), { parsed: false });
  assert.deepEqual(kinds, ["check"]);
});

test("an adjective check is counted as check_adj, keeping the verb-check baseline (#74)", async () => {
  const { counter, kinds } = recorder();
  const adjective = { parsed: true, relation: "amod" } as unknown as CollocationCheck;
  const verb = { parsed: true, relation: "obj" } as unknown as CollocationCheck;
  const check = new CountingCheckCollocation(
    { check: async (q) => (q === "schwerer Regen" ? adjective : verb) },
    counter,
    quiet,
  );
  await check.check("schwerer Regen");
  await check.check("Sport machen");
  assert.deepEqual(kinds, ["check_adj", "check"]);
});

test("a failing counter is logged and never fails the request", async () => {
  const { counter } = recorder("reject");
  const errors: unknown[] = [];
  const lookup = new CountingLookupCollocations({ lookup: async () => found }, counter, { error: (...a) => errors.push(a) });
  assert.equal(await lookup.lookup("Frage"), found);
  await new Promise((r) => setImmediate(r));
  assert.equal(errors.length, 1);
});

test("a slow counter does not delay the response", async () => {
  const { counter } = recorder("hang");
  const check = new CountingCheckCollocation({ check: async () => parsed }, counter, quiet);
  assert.equal(await check.check("Sport machen"), parsed); // would never resolve if awaited
});

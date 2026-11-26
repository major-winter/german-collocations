import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollocationStore } from "./ports/out/CollocationStore.ts";
import type { CollocationEntry } from "@collocations/types";
import type { LabVerbPair } from "../domain/collocations.ts";
import { LookupCollocationsService } from "./LookupCollocationsService.ts";

// The use case runs against an in-memory adapter - no database needed.
function fakeStore(overrides: Partial<CollocationStore> = {}): CollocationStore {
  return {
    resolveHeadword: async (word) =>
      word === "Kritik" || word === "Kritiken"
        ? { lemma: { id: 10, text: "Kritik" }, pos: "NOUN" }
        : null,
    findAdjacencyCollocations: async () => [],
    findAdjectiveAttributes: async () => [],
    findLabVerbPairs: async () => [],
    ...overrides,
  };
}

function entry(word: string, section: CollocationEntry["section"]): CollocationEntry {
  return { word, cooccurrence: 5, significance: 8, section, examples: [] };
}

test("an unknown word is null", async () => {
  const service = new LookupCollocationsService(fakeStore());
  assert.equal(await service.lookup("zzz"), null);
});

test("a word without a lemma still gets its lab pairs", async () => {
  const pair: LabVerbPair = {
    relation: "obj", verb: "üben", prep: "", noun: "Kritik", phraseNoun: "Kritik", nounArticle: "die",
    score: 1, pairFreq: 2, examples: [],
  };
  const service = new LookupCollocationsService(
    fakeStore({
      resolveHeadword: async () => ({ lemma: null, pos: "NOUN" }),
      findLabVerbPairs: async (_side, lemma) => (lemma === "Kritik" ? [pair] : []),
    }),
  );
  const result = await service.lookup("Kritik");
  assert.deepEqual(result?.collocations, []);
  assert.equal(result?.verbNounPairs?.pairs[0].phrase, "Kritik üben");
  assert.equal(result?.verbNounPairs?.article, "die");
});

test("falls back from the searched word to its lemma for lab pairs", async () => {
  const asked: string[] = [];
  const service = new LookupCollocationsService(
    fakeStore({
      findLabVerbPairs: async (_side, lemma) => {
        asked.push(lemma);
        return [];
      },
    }),
  );
  const result = await service.lookup("Kritiken");
  assert.deepEqual(asked, ["Kritiken", "Kritik"]);
  assert.equal(result?.verbNounPairs?.lemma, "Kritik");
});

test("a noun page drops the adjacency verb section in favour of lab pairs", async () => {
  const service = new LookupCollocationsService(
    fakeStore({
      findAdjacencyCollocations: async () => [
        entry("üben", "verb"),
        entry("scharf", "other"),
      ],
    }),
  );
  const result = await service.lookup("Kritik");
  assert.deepEqual(result?.collocations.map((c) => c.word), ["scharf"]);
});

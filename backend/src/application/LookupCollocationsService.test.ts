import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollocationStore } from "./ports/out/CollocationStore.ts";
import type { AdjacencyRow, LabVerbPairRow } from "../domain/collocations.ts";
import { LookupCollocationsService } from "./LookupCollocationsService.ts";

// The use case runs against an in-memory adapter - no database needed.
function fakeStore(overrides: Partial<CollocationStore> = {}): CollocationStore {
  return {
    findWordId: async (word) => (word === "Kritik" || word === "Kritiken" ? 1 : null),
    findDominantLemma: async () => ({ id: 10, text: "Kritik" }),
    findDominantPos: async () => "NOUN",
    findAdjacencyCollocations: async () => [],
    findAdjectiveAttributes: async () => [],
    findGovernedPrepositions: async () => [],
    findLabVerbPairs: async () => [],
    ...overrides,
  };
}

function adjacency(word: string, section: AdjacencyRow["section"], rightLemmaId: number): AdjacencyRow {
  return {
    leftLemmaId: 10, rightLemmaId, word, cooccurrence: 5, significance: 8, section,
    sentence: null, leftWord: null, rightWord: null,
  };
}

test("an unknown word is null", async () => {
  const service = new LookupCollocationsService(fakeStore());
  assert.equal(await service.lookup("zzz"), null);
});

test("a word without a lemma still gets its lab pairs", async () => {
  const pair: LabVerbPairRow = {
    relation: "obj", verb: "üben", prep: "", noun: "Kritik", phraseNoun: "Kritik",
    score: 1, pairFreq: 2, sentence: null, verbSurface: null, nounSurface: null,
  };
  const service = new LookupCollocationsService(
    fakeStore({
      findDominantLemma: async () => null,
      findLabVerbPairs: async (_side, lemma) => (lemma === "Kritik" ? [pair] : []),
    }),
  );
  const result = await service.lookup("Kritik");
  assert.deepEqual(result?.collocations, []);
  assert.equal(result?.verbNounPairs?.pairs[0].phrase, "Kritik üben");
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
        adjacency("üben", "verb", 20),
        adjacency("scharf", "other", 21),
      ],
    }),
  );
  const result = await service.lookup("Kritik");
  assert.deepEqual(result?.collocations.map((c) => c.word), ["scharf"]);
});

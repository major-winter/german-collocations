import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollocationCheck } from "@collocations/types";
import type { AdjectiveCount } from "../domain/adjectiveCheck.ts";
import type { Headword } from "./ports/out/CollocationStore.ts";
import type { AdjectiveLemma, CollocationCheckStore } from "./ports/out/CollocationCheckStore.ts";
import { CheckCollocationService } from "./CheckCollocationService.ts";

// Decision #74: the role assignment and the adjective branch, against an
// in-memory store.

const headwords: Record<string, Headword> = {
  Regen: { lemma: { id: 100, text: "Regen" }, pos: "NOUN" },
  Kosten: { lemma: { id: 200, text: "Kosten" }, pos: "NOUN" },
  Sport: { lemma: { id: 300, text: "Sport" }, pos: "NOUN" },
  Nacht: { lemma: { id: 400, text: "Nacht" }, pos: "NOUN" },
  Frage: { lemma: { id: 500, text: "Frage" }, pos: "NOUN" },
  Hohe: { lemma: { id: 3, text: "hoch" }, pos: "ADJ" },
  Starker: { lemma: { id: 1, text: "stark" }, pos: "ADJ" },
};

const adjectives: Record<string, AdjectiveLemma> = {
  starker: { id: 1, lemma: "stark", mostlyAdjective: true },
  stark: { id: 1, lemma: "stark", mostlyAdjective: true },
  starken: { id: 1, lemma: "stark", mostlyAdjective: true },
  schwerer: { id: 2, lemma: "schwer", mostlyAdjective: true },
  hohe: { id: 3, lemma: "hoch", mostlyAdjective: true },
  kosten: { id: 9, lemma: "kosten", mostlyAdjective: false }, // a tagger error in the #54 data
  regen: { id: 8, lemma: "reg", mostlyAdjective: false },
  bekannte: { id: 5, lemma: "bekannt", mostlyAdjective: true },
  offene: { id: 36, lemma: "offen", mostlyAdjective: false },
};

const verbs: Record<string, string> = {
  machen: "machen", regen: "sich regen", kosten: "kosten", bekannte: "bekennen", stellt: "stellen", offene: "öffnen",
};

const lemmaOf = (id: number) => Object.values(adjectives).find((a) => a.id === id)?.lemma ?? `adj${id}`;
const pair = (adjectiveId: number, count: number, adjectiveTotal: number): AdjectiveCount => ({
  adjectiveId, adjective: lemmaOf(adjectiveId), count, adjectiveTotal,
});

// Regen: stark is typical, schwer (one use, a common adjective) is not.
const regenPairs = [pair(1, 30, 3000), pair(2, 1, 4000), pair(11, 10, 200), pair(12, 8, 300), pair(13, 6, 100), pair(14, 5, 900)];
const fragePairs = [pair(36, 50, 100), pair(31, 20, 300), pair(32, 10, 200), pair(33, 9, 50), pair(34, 8, 80)];
const kostenPairs = [pair(3, 200, 2000), pair(21, 50, 800), pair(22, 20, 300), pair(23, 10, 100), pair(24, 9, 50)];

function store(): CollocationCheckStore {
  return {
    resolveHeadword: async (word) => headwords[word] ?? null,
    findVerbCandidates: async (surface) => (verbs[surface] ? [{ verb: verbs[surface], uses: 3 }] : []),
    findObjectPairs: async (noun) =>
      noun === "Sport" || noun === "Frage"
        ? [{
            verb: noun === "Sport" ? "machen" : "stellen", noun, phraseNoun: noun, score: 10,
            subjectScore: null, verbObjectShare: null,
          }]
        : [],
    findAdjectiveLemma: async (surface) => adjectives[surface] ?? null,
    findAdjectiveCounts: async (nounLemmaId, adjectiveLemmaId) => {
      const pairs = { 100: regenPairs, 200: kostenPairs, 500: fragePairs }[nounLemmaId] ?? [];
      return {
        nounTotal: { 100: 200, 200: 800, 500: 150 }[nounLemmaId] ?? 0,
        pairs: pairs.filter((p) => p.count >= 5 || p.adjectiveId === adjectiveLemmaId),
      };
    },
    findWrittenForms: async (nounLemmaId, ids) =>
      ids
        .filter((id) => id !== 13) // a pair without examples
        .map((id) => ({
          adjectiveId: id,
          adjectiveWord: id === 3 ? "höhere" : `${lemmaOf(id)}e`, // "hoch" only as a comparative
          nounWord: { 100: "Regen", 200: "Kosten", 500: "Frage" }[nounLemmaId] ?? "?",
          examples: 1,
        })),
  };
}

const service = new CheckCollocationService(store());

function amod(check: CollocationCheck) {
  assert.equal(check.parsed, true);
  assert.equal((check as { relation: string }).relation, "amod");
  return check as Extract<CollocationCheck, { relation: "amod" }>;
}

test("schwerer Regen is not typical, with written suggestions", async () => {
  const check = amod(await service.check("schwerer Regen"));
  assert.equal(check.noun, "Regen");
  assert.equal(check.adjectiveTyped, "schwerer");
  assert.equal(check.adjective, "schwer");
  assert.equal(check.verdict, "unusual");
  assert.equal(check.matched, null);
  // The top 3 by logDice are adj11, adj13, adj12; adj13 has no example,
  // so it is dropped rather than shown as a bare lemma.
  assert.deepEqual(check.suggestions.map((s) => s.phrase), ["adj11e Regen", "adj12e Regen"]);
  assert.deepEqual(check.suggestions[0], { phrase: "adj11e Regen", nounWord: "Regen", partnerWord: "adj11e" });
});

test("the adjective is found in any order, with an article or a sentence-initial capital", async () => {
  for (const q of ["starker Regen", "Regen stark", "ein starker Regen", "Starker Regen"]) {
    const check = amod(await service.check(q));
    assert.equal(check.adjective, "stark", q);
    assert.equal(check.noun, "Regen", q);
  }
});

test("hohe kosten: a lowercase noun that is also a verb form", async () => {
  const check = amod(await service.check("hohe kosten"));
  assert.equal(check.noun, "Kosten");
  assert.equal(check.adjective, "hoch");
  assert.equal(check.verdict, "usual");
  // The examples only write "höhere Kosten": the card shows the phrase as
  // typed rather than a comparative the learner did not ask about.
  assert.equal(check.matched, null);
});

test("verb checks are unchanged", async () => {
  const check = await service.check("Sport machen");
  assert.equal(check.parsed && check.relation, "obj");
});

test("a separable particle or sich rules out the adjective branch", async () => {
  assert.deepEqual(await service.check("einen starken Regen ab"), { parsed: false });
  assert.deepEqual(await service.check("sich starker Regen"), { parsed: false });
});

test("a word with no attributive lemma is a plain search", async () => {
  // "gute" is not in this store; with real data "gute Nacht" is an adjective check.
  assert.deepEqual(await service.check("gute Nacht"), { parsed: false });
});

test("bekannte Frage: before its noun, a form that is mostly the adjective is the adjective", async () => {
  // The verb reading ("bekennen") is not usual, and "bekannte" is mostly tagged ADJ.
  const check = amod(await service.check("eine bekannte Frage"));
  assert.equal(check.adjective, "bekannt");
  assert.equal(check.verdict, "unusual");
});

test("a verb form that is only rarely an adjective stays a verb", async () => {
  // "regen" is mostly a verb; its adjective lemma "reg" has no pair with Frage.
  const check = await service.check("regen Frage");
  assert.equal(check.parsed && check.relation, "obj");
});

test("a form mostly tagged as a verb stays a verb, even when its adjective reading is usual", async () => {
  // "offene" here is mostly a verb form; "offen Frage" would be a usual pair.
  const check = await service.check("offene Frage");
  assert.equal(check.parsed && check.relation, "obj");
});

test("the verb reading stays when the verb comes after the noun or the verb check is usual", async () => {
  const after = await service.check("Frage bekannte");
  assert.equal(after.parsed && after.relation, "obj");
  const usual = await service.check("Sport machen");
  assert.equal(usual.parsed && usual.relation, "obj");
});

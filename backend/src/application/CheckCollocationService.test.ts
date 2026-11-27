import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollocationCheck } from "@collocations/types";
import type { AdjectiveCount } from "../domain/adjectiveCheck.ts";
import type { Headword } from "./ports/out/CollocationStore.ts";
import type { AdjectiveLemma, CollocationCheckStore } from "./ports/out/CollocationCheckStore.ts";
import type { OblPair } from "../domain/prepositionCheck.ts";
import { CheckCollocationService } from "./CheckCollocationService.ts";

// Decision #74: the role assignment and the adjective branch, against an
// in-memory store.

const headwords: Record<string, Headword> = {
  Regen: { lemma: { id: 100, text: "Regen" }, pos: "NOUN" },
  Kosten: { lemma: { id: 200, text: "Kosten" }, pos: "NOUN" },
  Sport: { lemma: { id: 300, text: "Sport" }, pos: "NOUN" },
  Nacht: { lemma: { id: 400, text: "Nacht" }, pos: "NOUN" },
  Frage: { lemma: { id: 500, text: "Frage" }, pos: "NOUN" },
  Sitzung: { lemma: { id: 600, text: "Sitzung" }, pos: "NOUN" },
  Verfügung: { lemma: { id: 700, text: "Verfügung" }, pos: "NOUN" },
  Foto: { lemma: { id: 800, text: "Foto" }, pos: "NOUN" },
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

const verbs: Record<string, string | string[]> = {
  machen: "machen", regen: "sich regen", kosten: "kosten", bekannte: "bekennen", stellt: "stellen", offene: "öffnen",
  teilnehmen: "teilnehmen", stellen: "stellen", treffen: "treffen",
  // #78: finite forms of a particle verb, as the lab examples write them split.
  nehme: ["nehmen", "teilnehmen"], nimmt: ["nehmen", "teilnehmen", "aufnehmen"], ist: "sein",
  aufnehmen: "aufnehmen", // the lab verb itself, found by its lemma
  aufmachen: "aufmachen",
};

// Decision #76: the nouns whose obl pairs the fake store knows, and every noun it was asked about.
const oblPairs: Record<string, OblPair[]> = {
  Sitzung: [{ verb: "teilnehmen", prep: "an", noun: "Sitzung", phraseNoun: "an den Sitzungen", score: 1201 }],
  Verfügung: [{ verb: "stellen", prep: "zu", noun: "Verfügung", phraseNoun: "zur Verfügung", score: 9000 }],
};
const oblLookups: string[] = [];

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
    findVerbCandidates: async (surface) => [verbs[surface] ?? []].flat().map((verb) => ({ verb, uses: 3 })),
    findObjectPairs: async (noun) =>
      noun === "Sport" || noun === "Frage" || noun === "Foto"
        ? [{
            verb: { Sport: "machen", Frage: "stellen", Foto: "aufnehmen" }[noun]!, noun, phraseNoun: noun, score: 10,
            subjectScore: null, verbObjectShare: null,
          }]
        : [],
    findOblPairs: async (noun) => {
      oblLookups.push(noun);
      return oblPairs[noun] ?? [];
    },
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
  // The usual pairs by count are stark (30), adj11 (10), adj12 (8), adj13 (6);
  // the top 3 are shown, each as its examples write it.
  assert.deepEqual(check.suggestions.map((s) => s.phrase), ["starke Regen", "adj11e Regen", "adj12e Regen"]);
  assert.deepEqual(check.suggestions[1], { phrase: "adj11e Regen", nounWord: "Regen", partnerWord: "adj11e" });
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

test("the verb-vs-adjective rule holds in either word order", async () => {
  // The card's field sends noun + word ("Frage bekannte"); it must agree
  // with the search box ("bekannte Frage").
  const after = amod(await service.check("Frage bekannte"));
  assert.equal(after.adjective, "bekannt");
  assert.equal(after.verdict, "unusual");
});

test("the verb reading stays when the verb check is usual", async () => {
  const usual = await service.check("Sport machen");
  assert.equal(usual.parsed && usual.relation, "obj");
});

function obl(check: CollocationCheck) {
  assert.equal(check.parsed && check.relation, "obl");
  return check as Extract<CollocationCheck, { relation: "obl" }>;
}

test("an der Sitzung teilnehmen is usual through the obl branch (#76)", async () => {
  const check = obl(await service.check("an der Sitzung teilnehmen"));
  assert.equal(check.noun, "Sitzung");
  assert.equal(check.preposition, "an");
  assert.equal(check.verb, "teilnehmen");
  assert.equal(check.verdict, "usual");
  assert.equal(check.matched?.phrase, "an den Sitzungen teilnehmen");
});

test("zur Verfügung stellen maps the contraction and opens the Verfügung page", async () => {
  const check = obl(await service.check("zur Verfügung stellen"));
  assert.equal(check.noun, "Verfügung");
  assert.equal(check.prepositionTyped, "zur");
  assert.equal(check.preposition, "zu");
  assert.equal(check.verdict, "usual");
});

test("a phrase splitPhrase accepts never reaches the obl branch", async () => {
  oblLookups.length = 0;
  await service.check("Sport machen");
  await service.check("schwerer Regen");
  assert.deepEqual(oblLookups, []);
});

test("an obl phrase whose noun has no page is not parsed", async () => {
  assert.deepEqual(await service.check("an der Tagung teilnehmen"), { parsed: false });
});

// Decision #78: learner-style sentences.

test("a sentence with a split particle gets the dictionary form's verdict", async () => {
  const dictionary = obl(await service.check("an der Sitzung teilnehmen"));
  for (const q of ["Ich nehme an der Sitzung teil", "nimmt an der Sitzung teil", "Ich nehme an einer wichtigen Sitzung teil"]) {
    const check = obl(await service.check(q));
    assert.equal(check.verb, "teilnehmen", q);
    assert.equal(check.verdict, dictionary.verdict, q);
    assert.deepEqual(check.matched, dictionary.matched, q);
    assert.equal(check.phrase, q, q);
  }
});

test("an adjective inside the object phrase leaves the verb check", async () => {
  const check = await service.check("Wir stellen eine wichtige Frage");
  assert.equal(check.parsed && check.relation, "obj");
  assert.equal(check.parsed && check.verdict, "usual");
});

test("a particle verb the examples never write with the typed form is particle + the form's lemma", async () => {
  // The examples have "nehme" for "nehmen" and "teilnehmen", not for "aufnehmen".
  const check = await service.check("Ich nehme ein Foto auf");
  assert.equal(check.parsed && check.relation, "obj");
  assert.equal(check.parsed && check.relation === "obj" && check.verb, "aufnehmen");
  assert.equal(check.parsed && check.verdict, "usual");
});

test("a trailing word after a verb-final phrase is no split particle (review finding)", async () => {
  // "Sport machen auf" must not become "aufmachen", like "Entscheidung
  // treffen über" -> "übertreffen": a split particle follows a verb that
  // comes before its noun ("legt eine Pause ein").
  assert.deepEqual(await service.check("Sport machen auf"), { parsed: false });
  assert.deepEqual(await service.check("Foto aufnehmen auf"), { parsed: false });
});

test("a trailing particle the typed verb has no particle verb for is not parsed", async () => {
  // "offen" is also a predicative adjective: "Die Frage ist offen" must not
  // become "ist kein typisches Verb zu Frage".
  assert.deepEqual(await service.check("Die Frage ist offen"), { parsed: false });
});

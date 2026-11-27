import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { CollocationCheck } from "@collocations/types";
import { CheckCollocationService } from "../../application/CheckCollocationService.ts";
import { PgCollocationCheckStore } from "./PgCollocationCheckStore.ts";
import { openTestDatabase, seeder } from "./testDatabase.ts";

// Decisions #70, #74: the collocation check through its inbound port,
// against a real Postgres (#67).

const db = await openTestDatabase();
const store = new PgCollocationCheckStore(db.pool);
const service = new CheckCollocationService(store);
let seed = seeder(db.pool);

beforeEach(async () => {
  await db.reset();
  seed = seeder(db.pool);
});
after(() => db.close());

function parsed(check: CollocationCheck) {
  assert.equal(check.parsed && check.relation, "obj");
  return check as Extract<CollocationCheck, { relation: "obj" }>;
}
function amod(check: CollocationCheck) {
  assert.equal(check.parsed && check.relation, "amod");
  return check as Extract<CollocationCheck, { relation: "amod" }>;
}
const phrases = (check: CollocationCheck) => {
  assert.equal(check.parsed, true);
  return (check as Extract<CollocationCheck, { parsed: true }>).suggestions.map((s) => s.phrase);
};

async function entscheidung() {
  await seed.word("Entscheidung", { pos: "NOUN" });
  await seed.labPair("treffen", "Entscheidung", { score: 900, phraseNoun: "Entscheidungen" });
  await seed.labPair("fällen", "Entscheidung", { score: 500, phraseNoun: "eine Entscheidung" });
  await seed.labPair("begründen", "Entscheidung", { score: 300, phraseNoun: "die Entscheidung" });
  await seed.labPair("revidieren", "Entscheidung", { score: 100 });
  // "machen" is a known verb through another noun's example.
  await seed.labPair("machen", "Sport", { score: 500 });
  await seed.labPairExample("machen", "Sport", 1, "Wir machen Sport.", { verb: "machen", noun: "Sport" });
  await seed.labPairExample("machen", "Sport", 2, "Er macht Sport.", { verb: "macht", noun: "Sport" });
}

test("eine Entscheidung machen is not typical, with the noun's top three verbs", async () => {
  await entscheidung();
  const check = parsed(await service.check("eine  Entscheidung machen"));
  assert.equal(check.phrase, "eine Entscheidung machen");
  assert.equal(check.noun, "Entscheidung");
  assert.equal(check.verb, "machen");
  assert.equal(check.verbTyped, "machen");
  assert.equal(check.verdict, "unusual");
  assert.deepEqual(phrases(check), ["Entscheidungen treffen", "eine Entscheidung fällen", "die Entscheidung begründen"]);
});

test("Sport machen is usual, naming the stronger verb", async () => {
  await seed.word("Sport", { pos: "NOUN" });
  await seed.labPair("treiben", "Sport", { score: 900 });
  await seed.labPair("machen", "Sport", { score: 500 });
  const check = parsed(await service.check("Sport machen"));
  assert.equal(check.verdict, "usual");
  assert.equal(check.matched?.phrase, "Sport machen");
  assert.deepEqual(phrases(check), ["Sport treiben"]);
});

test("nimmt ein Foto reads nimmt as nehmen, never aufnehmen", async () => {
  await seed.word("Foto", { pos: "NOUN" });
  await seed.labPair("aufnehmen", "Foto", { score: 95 });
  await seed.labPair("nehmen", "Platz", { score: 900 });
  for (let rank = 1; rank <= 3; rank++) {
    await seed.labPairExample("nehmen", "Platz", rank, `Satz ${rank}.`, { verb: "nimmt", noun: "Platz" });
  }
  await seed.labPairExample("aufnehmen", "Foto", 1, "Sie nimmt ein Foto auf.", { verb: "nimmt", noun: "Foto" });
  const check = parsed(await service.check("nimmt ein Foto"));
  assert.equal(check.verb, "nehmen");
  assert.equal(check.verdict, "unusual");
});

test("the noun is found when both or neither words are capitalised", async () => {
  await entscheidung();
  assert.equal(parsed(await service.check("Macht eine Entscheidung")).noun, "Entscheidung");
  const lower = parsed(await service.check("eine entscheidung machen"));
  assert.equal(lower.noun, "Entscheidung");
  assert.equal(lower.verb, "machen");
});

test("a noun with a page but no object pairs gets noData", async () => {
  await seed.word("Dusche", { pos: "NOUN" });
  await seed.labPair("nehmen", "Platz", { score: 900 });
  const check = parsed(await service.check("eine Dusche nehmen"));
  assert.equal(check.noun, "Dusche");
  assert.equal(check.verdict, "noData");
});

test("the subject filter drops Entscheidung fallen but keeps Bus fahren", async () => {
  await seed.word("Bus", { pos: "NOUN" });
  await seed.labPair("fahren", "Bus", { score: 117, pairFreq: 18 });
  await seed.labPair("fahren", "Bus", { relation: "nsubj", score: 987, pairFreq: 115 });
  await seed.labPair("fahren", "Auto", { score: 800, pairFreq: 200 });
  assert.equal(parsed(await service.check("Bus fahren")).verdict, "usual");

  await entscheidung();
  await seed.labPair("fallen", "Entscheidung", { score: 627, pairFreq: 60 });
  await seed.labPair("fallen", "Entscheidung", { relation: "nsubj", score: 1987, pairFreq: 400 });
  const fallen = parsed(await service.check("die Entscheidung fallen"));
  assert.equal(fallen.verdict, "unusual");
  assert.ok(!phrases(fallen).includes("Entscheidung fallen"));
});

test("a phrase that is not noun + verb is not parsed", async () => {
  await entscheidung();
  await seed.word("Hallo", { pos: "INTJ" });
  assert.deepEqual(await service.check("Hallo Welt"), { parsed: false });
  assert.deepEqual(await service.check("Entscheidung"), { parsed: false });
});

test("with no attributive data, an adjective + noun search is not a check (#70 I1, narrowed by #74)", async () => {
  await seed.word("Hilfe", { pos: "NOUN" });
  await seed.labPair("leisten", "Hilfe", { score: 900 });
  assert.deepEqual(await service.check("erste Hilfe"), { parsed: false });
});

// Decision #74: adjective + noun from the #54 attributive data.
async function regen() {
  await seed.word("Regen", { pos: "NOUN" });
  await seed.word("Wind", { pos: "NOUN" });
  await seed.word("Arbeit", { pos: "NOUN" });
  for (const adjective of ["stark", "leicht", "heftig", "strömend", "dicht", "schwer", "kalt"]) {
    await seed.word(adjective, { pos: "ADJ" });
  }
  await seed.word("starker", { lemma: "stark", pos: "ADJ" });
  await seed.word("schwerer", { lemma: "schwer", pos: "ADJ" });
  const counts: [string, number][] = [
    ["stark", 30], ["leicht", 10], ["heftig", 8], ["strömend", 6], ["dicht", 5], ["schwer", 1], ["kalt", 2],
  ];
  for (const [adjective, count] of counts) {
    await seed.adjectiveAttribute("Regen", adjective, count);
    const written = adjective === "stark" ? "starken" : `${adjective}er`;
    await seed.adjectiveAttributeExample("Regen", adjective, `Es gab ${written} Regen.`, { noun: "Regen", adjective: written });
  }
  // Other written forms of "stark Regen": sentence-initial (counted
  // lowercase), and more often still with a non-lemma noun form.
  await seed.adjectiveAttributeExample("Regen", "stark", "Starker Regen fiel.", { noun: "Regen", adjective: "Starker" });
  await seed.adjectiveAttributeExample("Regen", "stark", "Starker Regen fällt.", { noun: "Regen", adjective: "Starker" });
  await seed.adjectiveAttributeExample("Regen", "stark", "Bei starken Regens.", { noun: "Regens", adjective: "starken" });
  await seed.adjectiveAttributeExample("Regen", "stark", "Wegen starken Regens.", { noun: "Regens", adjective: "starken" });
  await seed.adjectiveAttributeExample("Regen", "stark", "Trotz starken Regens.", { noun: "Regens", adjective: "starken" });
  // stark and schwer are common elsewhere: their totals make Regen pairs score low.
  await seed.adjectiveAttribute("Wind", "stark", 3000);
  await seed.adjectiveAttribute("Arbeit", "schwer", 4000);
}

test("the store counts the noun's full total and the adjective's other nouns", async () => {
  await regen();
  const { rows } = await db.pool.query<{ id: number; lemma: string }>("SELECT id, lemma FROM lemmas");
  const id = (lemma: string) => rows.find((r) => r.lemma === lemma)!.id;
  const counts = await store.findAdjectiveCounts(id("Regen"), id("schwer"));
  assert.equal(counts.nounTotal, 62);
  const byLemma = new Map(counts.pairs.map((p) => [p.adjective, p]));
  assert.deepEqual([...byLemma.keys()].sort(), ["dicht", "heftig", "leicht", "schwer", "stark", "strömend"]);
  assert.equal(byLemma.get("stark")?.adjectiveTotal, 3030);
  assert.equal(byLemma.get("schwer")?.count, 1);
  assert.deepEqual(await store.findAdjectiveLemma("starker"), { id: id("stark"), lemma: "stark", mostlyAdjective: true });
  assert.equal(await store.findAdjectiveLemma("regen"), null);
});

test("schwerer Regen is not typical, with the three most frequent usual pairs as written", async () => {
  await regen();
  const check = amod(await service.check("schwerer Regen"));
  assert.equal(check.noun, "Regen");
  assert.equal(check.adjective, "schwer");
  assert.equal(check.verdict, "unusual");
  assert.deepEqual(phrases(check), ["starker Regen", "leichter Regen", "heftiger Regen"]);
});

test("ein starker Regen is usual, written as the corpus most often writes it", async () => {
  await regen();
  const check = amod(await service.check("ein starker Regen"));
  assert.equal(check.verdict, "usual");
  // "starken Regens" is more frequent, but the noun's lemma form wins;
  // "Starker" at a sentence start counts as "starker".
  assert.deepEqual(check.matched, { phrase: "starker Regen", nounWord: "Regen", partnerWord: "starker" });
  // The most frequent usual pair: nothing is "noch häufiger".
  assert.deepEqual(phrases(check), []);
});

test("a noun with too few frequent adjectives gets noData", async () => {
  await seed.word("Kaffee", { pos: "NOUN" });
  await seed.word("stark", { pos: "ADJ" });
  await seed.word("heiß", { pos: "ADJ" });
  await seed.adjectiveAttribute("Kaffee", "heiß", 20);
  await seed.adjectiveAttribute("Kaffee", "stark", 2);
  const check = amod(await service.check("Kaffee stark"));
  assert.equal(check.verdict, "noData");
});

test("lange Zeit: the form's attributive lemma wins over its dominant adverb lemma", async () => {
  await seed.word("Zeit", { pos: "NOUN" });
  await seed.word("lang", { pos: "ADJ" });
  await seed.word("kurz", { pos: "ADJ" });
  await seed.word("lange", { pos: "ADV" }); // dominant lemma "lange", the adverb
  await seed.wordLemma("lange", "lang", 5);
  for (const [adjective, count] of [["lang", 40], ["kurz", 30], ["lange", 1]] as const) {
    await seed.adjectiveAttribute("Zeit", adjective, count);
  }
  for (const adjective of ["a", "b", "c"]) {
    await seed.word(adjective, { pos: "ADJ" });
    await seed.adjectiveAttribute("Zeit", adjective, 5);
  }
  await seed.adjectiveAttributeExample("Zeit", "lang", "Seit langer Zeit.", { noun: "Zeit", adjective: "langer" });
  const check = amod(await service.check("lange Zeit"));
  assert.equal(check.adjective, "lang");
  assert.equal(check.verdict, "usual");
  assert.equal(check.matched?.phrase, "langer Zeit");
});

test("macht eine Entscheidung stays a verb check, though tagger errors give machen attributive rows", async () => {
  await entscheidung();
  await seed.word("macht", { lemma: "machen", pos: "VERB" });
  for (const adjective of ["richtig", "schwer", "wichtig", "endgültig", "politisch"]) {
    await seed.word(adjective, { pos: "ADJ" });
    await seed.adjectiveAttribute("Entscheidung", adjective, 20);
  }
  await seed.adjectiveAttribute("Entscheidung", "machen", 3);
  const check = parsed(await service.check("macht eine Entscheidung"));
  assert.equal(check.verb, "machen");
  assert.equal(check.verdict, "unusual");
});

test("eine bekannte Frage: a form mostly tagged ADJ is the adjective, not the verb", async () => {
  await seed.word("Frage", { pos: "NOUN" });
  await seed.labPair("stellen", "Frage", { score: 900 });
  await seed.labPair("bekennen", "Schuld", { score: 50 });
  await seed.labPairExample("bekennen", "Schuld", 1, "Er bekannte seine Schuld.", { verb: "bekannte", noun: "Schuld" });
  await seed.word("bekannt", { pos: "ADJ" });
  await seed.word("bekannte", { lemma: "bekannt", pos: "ADJ" });
  for (const adjective of ["offen", "zentral", "wichtig", "entscheidend", "bekannt"]) {
    if (adjective !== "bekannt") await seed.word(adjective, { pos: "ADJ" });
    await seed.adjectiveAttribute("Frage", adjective, adjective === "bekannt" ? 1 : 20);
  }
  const check = amod(await service.check("eine bekannte Frage"));
  assert.equal(check.adjective, "bekannt");
});

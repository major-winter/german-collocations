import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { CollocationCheck } from "@collocations/types";
import { CheckCollocationService } from "../../application/CheckCollocationService.ts";
import { PgCollocationCheckStore } from "./PgCollocationCheckStore.ts";
import { openTestDatabase, seeder } from "./testDatabase.ts";

// Decision #70: the collocation check through its inbound port, against a
// real Postgres (#67).

const db = await openTestDatabase();
const service = new CheckCollocationService(new PgCollocationCheckStore(db.pool));
let seed = seeder(db.pool);

beforeEach(async () => {
  await db.reset();
  seed = seeder(db.pool);
});
after(() => db.close());

function parsed(check: CollocationCheck) {
  assert.equal(check.parsed, true);
  return check as Extract<CollocationCheck, { parsed: true }>;
}
const phrases = (check: CollocationCheck) => parsed(check).suggestions.map((s) => s.phrase);

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

test("an adjective + noun search is not a check (final review I1)", async () => {
  await seed.word("Hilfe", { pos: "NOUN" });
  await seed.labPair("leisten", "Hilfe", { score: 900 });
  assert.deepEqual(await service.check("erste Hilfe"), { parsed: false });
});

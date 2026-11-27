import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { LookupCollocationsService } from "../../application/LookupCollocationsService.ts";
import { PgCollocationStore } from "./PgCollocationStore.ts";
import { openTestDatabase, seeder } from "./testDatabase.ts";

// Decision #67: the collocation rules that live in SQL, tested through the
// inbound port against a real Postgres. These assert what a learner gets
// back for a word, not which queries run, so they hold while the
// CollocationStore port behind them changes shape.

const db = await openTestDatabase();
const lookup = new LookupCollocationsService(new PgCollocationStore(db.pool));
let seed = seeder(db.pool);

beforeEach(async () => {
  await db.reset();
  seed = seeder(db.pool);
});
after(() => db.close());

function partners(collocations: { word: string; section: string }[]): [string, string][] {
  return collocations.map((c) => [c.word, c.section]);
}

test("an unknown word is not found", async () => {
  assert.equal(await lookup.lookup("Kritik"), null);
});

test("partners from either side, strongest first, each under its word class", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.word("scharf", { pos: "ADJ" });
  await seed.word("berechtigt", { pos: "ADJ" });
  await seed.word("an", { pos: "ADP" });
  await seed.collocation("scharf", "Kritik", 20);
  await seed.collocation("berechtigt", "Kritik", 5);
  await seed.collocation("Kritik", "an", 10);

  const result = await lookup.lookup("Kritik");
  assert.deepEqual(partners(result!.collocations), [
    ["scharf", "adjective"],
    ["an", "preposition"],
    ["berechtigt", "adjective"],
  ]);
});

test("a proper noun is never a partner (#57)", async () => {
  await seed.word("Präsident", { pos: "NOUN" });
  await seed.word("Trump", { pos: "PROPN" });
  await seed.word("neu", { pos: "ADJ" });
  await seed.collocation("Präsident", "Trump", 50);
  await seed.collocation("neu", "Präsident", 5);

  const result = await lookup.lookup("Präsident");
  assert.deepEqual(partners(result!.collocations), [["neu", "adjective"]]);
});

test("a partner below the logDice floor is left out (#43)", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  // logDice = 14 + log2(2 * 5 / (100 + 100000)) ≈ 0.7, far below 6.3
  await seed.word("selten", { pos: "ADJ", frequency: 100000 });
  await seed.collocation("selten", "Kritik", 5);

  const result = await lookup.lookup("Kritik");
  assert.deepEqual(result!.collocations, []);
});

test("a partner seen next to the headword fewer than 3 times is left out (#79)", async () => {
  // Two rare lemmas: one shared sentence already gives a high logDice
  // (14 + log2(2 / (50 + 3)) ≈ 9.3), so only a count floor stops it.
  await seed.word("Nebel", { pos: "NOUN", frequency: 50 });
  await seed.word("zartrosa", { pos: "ADJ", frequency: 3 });
  await seed.word("Niesel", { pos: "NOUN", frequency: 3 });
  await seed.word("Frost", { pos: "NOUN", frequency: 40 });
  await seed.collocation("zartrosa", "Nebel", 1);
  await seed.collocation("Nebel", "Niesel", 2);
  await seed.collocation("Nebel", "Frost", 3);

  const result = await lookup.lookup("Nebel");
  assert.deepEqual(partners(result!.collocations), [["Frost", "noun"]]);
});

test("an adjective the tagger often reads as an adverb still goes under 'adjective' (#79)", async () => {
  // "dicht": attributive "dichter Nebel" is ADJ, predicative "ist dicht" is ADV.
  await seed.word("Nebel", { pos: "NOUN" });
  await seed.word("dicht", { pos: "ADV", posShare: 0.55 });
  await seed.adjectiveShares("dicht", { adj: 0.41, adv: 0.55 });
  await seed.collocation("dicht", "Nebel", 19);

  const result = await lookup.lookup("Nebel");
  assert.deepEqual(partners(result!.collocations), [["dicht", "adjective"]]);
});

test("so on a noun page it is replaced by the attributive adjectives, not repeated under 'other' (#79)", async () => {
  await seed.word("Nebel", { pos: "NOUN" });
  await seed.word("dicht", { pos: "ADV", posShare: 0.55 });
  await seed.adjectiveShares("dicht", { adj: 0.41, adv: 0.55 });
  await seed.collocation("dicht", "Nebel", 19);
  await seed.adjectiveAttribute("Nebel", "dicht", 19);

  const result = await lookup.lookup("Nebel");
  assert.deepEqual(
    result!.collocations.map((c) => [c.word, c.section, c.cooccurrence]),
    [["dicht", "adjective", 19]],
  );
  // the attribute entry (share-ranked), not the adjacency one (logDice-ranked)
  assert.ok(result!.collocations[0].significance <= 1);
});

test("a real adverb stays under 'other', even with a few stray ADJ tags (#79)", async () => {
  await seed.word("Regen", { pos: "NOUN" });
  await seed.word("zeitweise", { pos: "ADV", posShare: 0.97 });
  await seed.adjectiveShares("zeitweise", { adj: 0.03, adv: 0.97 });
  await seed.collocation("zeitweise", "Regen", 10);

  const result = await lookup.lookup("Regen");
  assert.deepEqual(partners(result!.collocations), [["zeitweise", "other"]]);
});

test("at most 10 partners per word class, so one class can't crowd out another", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  for (let i = 1; i <= 12; i++) {
    await seed.word(`adjektiv${i}`, { pos: "ADJ" });
    await seed.collocation(`adjektiv${i}`, "Kritik", 10 + i);
  }
  await seed.word("auch", { pos: "ADV" });
  await seed.collocation("Kritik", "auch", 3);

  const result = await lookup.lookup("Kritik");
  const adjectives = result!.collocations.filter((c) => c.section === "adjective").map((c) => c.word);
  assert.equal(adjectives.length, 10);
  assert.equal(adjectives[0], "adjektiv12");
  assert.ok(!adjectives.includes("adjektiv1") && !adjectives.includes("adjektiv2"));
  assert.ok(result!.collocations.some((c) => c.word === "auch" && c.section === "other"));
});

test("a partner whose word class is unclear goes under 'other' (#36)", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.word("gut", { pos: "ADJ", posShare: 0.6 });
  await seed.collocation("gut", "Kritik", 20);

  const result = await lookup.lookup("Kritik");
  assert.deepEqual(partners(result!.collocations), [["gut", "other"]]);
});

test("up to 3 examples, with the surface words actually in each sentence (#44, #45)", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.word("Kritiken", { lemma: "Kritik", pos: "NOUN" });
  await seed.word("scharf", { pos: "ADJ" });
  await seed.word("scharfe", { lemma: "scharf", pos: "ADJ" });
  await seed.collocation("scharf", "Kritik", 20);
  await seed.collocationExample("scharfe", "Kritiken", "Es gab scharfe Kritiken.");
  await seed.collocationExample("scharfe", "Kritik", "Sie übte scharfe Kritik.");
  await seed.collocationExample("scharf", "Kritik", "Das war scharf Kritik.");
  await seed.collocationExample("scharfe", "Kritik", "Noch eine scharfe Kritik.");

  const result = await lookup.lookup("Kritik");
  const [scharf] = result!.collocations;
  assert.equal(scharf.word, "scharf");
  assert.equal(scharf.examples.length, 3);
  assert.deepEqual(scharf.examples[0], {
    sentence: "Es gab scharfe Kritiken.",
    searchWord: "Kritiken",
    collocateWord: "scharfe",
  });
});

test("attributive adjectives replace the adjacent-word adjectives on a noun page (#54)", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.word("scharf", { pos: "ADJ" });
  await seed.word("heftig", { pos: "ADJ" });
  await seed.word("leise", { pos: "ADJ" });
  await seed.collocation("scharf", "Kritik", 20);
  await seed.adjectiveAttribute("Kritik", "heftig", 5);
  await seed.adjectiveAttribute("Kritik", "leise", 2); // below the count floor of 3
  await seed.adjectiveAttributeExample("Kritik", "heftig", "Es hagelte heftige Kritik.", {
    noun: "Kritik",
    adjective: "heftige",
  });

  const result = await lookup.lookup("Kritik");
  assert.deepEqual(partners(result!.collocations), [["heftig", "adjective"]]);
  assert.deepEqual(result!.collocations[0].examples, [
    { sentence: "Es hagelte heftige Kritik.", searchWord: "Kritik", collocateWord: "heftige" },
  ]);
});

test("an adjective page lists the nouns it modifies, by share (#54)", async () => {
  await seed.word("scharf", { pos: "ADJ" });
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.word("Messer", { pos: "NOUN" });
  await seed.adjectiveAttribute("Kritik", "scharf", 6);
  await seed.adjectiveAttribute("Messer", "scharf", 4);

  const result = await lookup.lookup("scharf");
  assert.deepEqual(partners(result!.collocations), [
    ["Kritik", "noun"],
    ["Messer", "noun"],
  ]);
  assert.equal(result!.verbNounPairs, null);
});

test("a noun page gets its lab pairs, with up to 3 examples in rank order (#60)", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.labPair("üben", "Kritik", { score: 20 });
  await seed.labPair("stehen", "Kritik", { relation: "obl", prep: "in", phraseNoun: "in der Kritik", score: 15 });
  for (const rank of [2, 1, 4, 3]) {
    await seed.labPairExample("üben", "Kritik", rank, `Satz ${rank}.`, { verb: "übte", noun: "Kritik" });
  }

  const result = await lookup.lookup("Kritik");
  const pairs = result!.verbNounPairs!;
  assert.equal(pairs.side, "noun");
  assert.deepEqual(
    pairs.pairs.map((p) => [p.relation, p.chip, p.phrase]),
    [
      ["obj", "üben", "Kritik üben"],
      ["obl", "in der … stehen", "in der Kritik stehen"],
    ],
  );
  assert.deepEqual(
    pairs.pairs[0].examples.map((e) => [e.sentence, e.searchWord, e.collocateWord]),
    [
      ["Satz 1.", "Kritik", "übte"],
      ["Satz 2.", "Kritik", "übte"],
      ["Satz 3.", "Kritik", "übte"],
    ],
  );
});

test("a verb page also finds the verb's reflexive pairs (#60)", async () => {
  await seed.word("stellen", { pos: "VERB" });
  await seed.labPair("stellen", "Frage", { score: 10 });
  await seed.labPair("sich stellen", "Frage", { score: 12 });
  await seed.labPair("einstellen", "Arbeit", { score: 30 });

  const result = await lookup.lookup("stellen");
  assert.deepEqual(
    result!.verbNounPairs!.pairs.map((p) => [p.chip, p.phrase]),
    [
      ["sich Frage", "sich Frage stellen"],
      ["Frage", "Frage stellen"],
    ],
  );
});

test("at most 10 lab pairs per relation", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  for (let i = 1; i <= 12; i++) {
    await seed.labPair(`verb${i}`, "Kritik", { score: i });
  }
  await seed.labPair("kommen", "Kritik", { relation: "nsubj", score: 1 });

  const result = await lookup.lookup("Kritik");
  const pairs = result!.verbNounPairs!.pairs;
  const objects = pairs.filter((p) => p.relation === "obj");
  assert.equal(objects.length, 10);
  assert.equal(objects[0].partner, "verb12");
  assert.equal(pairs.filter((p) => p.relation === "nsubj").length, 1);
});

test("an inflected word falls back to its lemma's lab pairs (#60)", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.word("Kritiken", { lemma: "Kritik", pos: "NOUN" });
  await seed.labPair("üben", "Kritik");

  const result = await lookup.lookup("Kritiken");
  assert.equal(result!.verbNounPairs!.lemma, "Kritik");
  assert.equal(result!.verbNounPairs!.pairs.length, 1);
});

test("a noun page never shows adjacent verbs, even with no lab pairs (#60)", async () => {
  await seed.word("Kritik", { pos: "NOUN" });
  await seed.word("üben", { pos: "VERB" });
  await seed.collocation("Kritik", "üben", 20);

  const result = await lookup.lookup("Kritik");
  assert.deepEqual(result!.collocations, []);
  assert.deepEqual(result!.verbNounPairs, { side: "noun", lemma: "Kritik", article: null, pairs: [] });
});

test("a verb page shows each noun's article on its chip (#69)", async () => {
  await seed.word("stellen", { pos: "VERB" });
  await seed.labPair("stellen", "Frage", { phraseNoun: "Fragen", score: 20 });
  await seed.labPair("stellen", "Ahnung", { score: 10 });
  await seed.labNounGender("Frage", "die");

  const pairs = (await lookup.lookup("stellen"))!.verbNounPairs!;
  assert.deepEqual(
    pairs.pairs.map((p) => [p.chip, p.chipArticle, p.phrase]),
    [
      ["die Frage", "die", "Fragen stellen"],
      ["Ahnung", null, "Ahnung stellen"],
    ],
  );
  assert.equal(pairs.article, null);
});

test("a noun page carries the headword's article and the written noun (#69)", async () => {
  await seed.word("Entscheidung", { pos: "NOUN" });
  await seed.labPair("treffen", "Entscheidung", { phraseNoun: "Entscheidungen" });
  await seed.labNounGender("Entscheidung", "die");

  const pairs = (await lookup.lookup("Entscheidung"))!.verbNounPairs!;
  assert.equal(pairs.article, "die");
  assert.equal(pairs.pairs[0].phrase, "Entscheidungen treffen");
  assert.equal(pairs.pairs[0].phraseNoun, "Entscheidungen");
});

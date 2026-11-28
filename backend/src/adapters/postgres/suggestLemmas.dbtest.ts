import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { SuggestLemmasService } from "../../application/SuggestLemmasService.ts";
import { PgLemmaIndex } from "./PgLemmaIndex.ts";
import { openTestDatabase, seeder } from "./testDatabase.ts";

// Decision #85: lemma suggestions for the search box, through the inbound
// port against a real Postgres.

const db = await openTestDatabase();
const suggest = new SuggestLemmasService(new PgLemmaIndex(db.pool));
let seed = seeder(db.pool);

beforeEach(async () => {
  await db.reset();
  seed = seeder(db.pool);
});
after(() => db.close());

const lemmas = (rows: { lemma: string }[]) => rows.map((r) => r.lemma);

test("the forms of one lemma collapse into one suggestion", async () => {
  await seed.word("entscheiden", { pos: "VERB", frequency: 50 });
  await seed.word("entschieden", { lemma: "entscheiden", pos: "VERB", frequency: 80 });
  await seed.word("entschied", { lemma: "entscheiden", pos: "VERB", frequency: 70 });

  assert.deepEqual(await suggest.suggest("entsch"), [
    { lemma: "entscheiden", wordClass: "verb", article: null },
  ]);
});

test("a lemma that starts with the prefix comes before one reached by a form, then frequency", async () => {
  await seed.word("Frau", { pos: "NOUN", frequency: 500 });
  await seed.word("Frauen", { lemma: "Frau", pos: "NOUN", frequency: 900 });
  await seed.word("Fraueneinfluss", { pos: "NOUN", frequency: 10 });
  await seed.word("Fraudienst", { pos: "NOUN", frequency: 30 });

  assert.deepEqual(lemmas(await suggest.suggest("Fraue")), ["Fraueneinfluss", "Frau"]);
  assert.deepEqual(lemmas(await suggest.suggest("Frau")), ["Frau", "Fraudienst", "Fraueneinfluss"]);
});

test("names come after the other classes", async () => {
  await seed.word("Frank", { pos: "PROPN", frequency: 900 });
  await seed.word("Frage", { pos: "NOUN", frequency: 10 });

  assert.deepEqual(await suggest.suggest("Fra"), [
    { lemma: "Frage", wordClass: "noun", article: null },
    { lemma: "Frank", wordClass: "name", article: null },
  ]);
});

test("the article comes only from the lab's noun genders", async () => {
  await seed.word("Frage", { pos: "NOUN" });
  await seed.word("Frau", { pos: "NOUN" });
  await seed.word("fragen", { pos: "VERB" });
  await seed.labNounGender("Frage", "die");
  await seed.labNounGender("fragen", "das"); // a verb never gets an article

  const rows = await suggest.suggest("fra");
  const by = Object.fromEntries(rows.map((r) => [r.lemma, r]));
  assert.equal(by["Frage"].article, "die");
  assert.equal(by["Frau"].article, null);
  assert.equal(by["fragen"].article, null);
});

test("the prefix ignores case and umlauts", async () => {
  await seed.word("Größe", { pos: "NOUN" });

  assert.deepEqual(lemmas(await suggest.suggest("GRÖ")), ["Größe"]);
  assert.deepEqual(lemmas(await suggest.suggest("groe")), ["Größe"]);
  assert.deepEqual(lemmas(await suggest.suggest("grosse")), []);
});

test("LIKE wildcards in the text are plain characters", async () => {
  await seed.word("Frage", { pos: "NOUN" });

  assert.deepEqual(await suggest.suggest("%%"), []);
  assert.deepEqual(await suggest.suggest("F_a"), []);
});

test("a lemma without a word class, or that is no word of its own, is not suggested", async () => {
  await seed.word("Fragment"); // no pos: no lemma_dominant_pos row
  await seed.word("Fragen", { lemma: "Fragenkatalog", pos: "NOUN" }); // lemma text is not a word

  assert.deepEqual(await suggest.suggest("frag"), []);
});

test("an adjective spaCy tags ADV is an adjective, a true adverb stays one (#79)", async () => {
  await seed.word("deutlich", { pos: "ADV", frequency: 200 });
  await seed.word("derzeit", { pos: "ADV" });
  await seed.adjectiveShares("deutlich", { adj: 0.15, adv: 0.85 });

  assert.deepEqual(await suggest.suggest("de"), [
    { lemma: "deutlich", wordClass: "adjective", article: null },
    { lemma: "derzeit", wordClass: "adverb", article: null },
  ]);
});

test("lemmas glued from two words by the tagger are not suggested", async () => {
  await seed.word("wichtig", { pos: "ADJ", frequency: 10 });
  await seed.word("wichtigDie", { pos: "ADJ", frequency: 50 });
  await seed.word("Frauen-EM", { pos: "NOUN", frequency: 5 });

  assert.deepEqual(lemmas(await suggest.suggest("wicht")), ["wichtig"]);
  assert.deepEqual(lemmas(await suggest.suggest("frauen")), ["Frauen-EM"]);
});

test("at most six suggestions, most frequent first", async () => {
  for (let i = 1; i <= 8; i++) await seed.word(`Kriterium${i}`, { pos: "NOUN", frequency: i });

  const result = lemmas(await suggest.suggest("kri"));
  assert.equal(result.length, 6);
  assert.equal(result[0], "Kriterium8");
});

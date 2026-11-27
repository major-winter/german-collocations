import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjectiveCheckPhrase,
  attributiveLogDice,
  bestWrittenForm,
  isPositiveForm,
  positiveEnding,
  judgeAdjective,
  type AdjectiveCount,
  type AdjectiveCounts,
} from "./adjectiveCheck.ts";

let nextId = 1;
const ids = new Map<string, number>();
function idOf(adjective: string): number {
  if (!ids.has(adjective)) ids.set(adjective, nextId++);
  return ids.get(adjective)!;
}
function pair(adjective: string, count: number, adjectiveTotal: number): AdjectiveCount {
  return { adjectiveId: idOf(adjective), adjective, count, adjectiveTotal };
}
const names = (pairs: AdjectiveCount[]) => pairs.map((p) => p.adjective);

// A noun like "Regen": specific adjectives score high, general ones
// (schwer, groß) score low however often they occur.
const regen: AdjectiveCounts = {
  nounTotal: 200,
  pairs: [
    pair("stark", 30, 3000), // 14 + log2(60 / 3200)  ≈ 8.25
    pair("leicht", 10, 1500), // 14 + log2(20 / 1700)  ≈ 7.59
    pair("strömend", 6, 10), //  14 + log2(12 / 210)   ≈ 9.87
    pair("heftig", 8, 600), //   14 + log2(16 / 800)   ≈ 8.36
    pair("warm", 5, 5000), //    14 + log2(10 / 5200)  ≈ 4.98
    pair("schwer", 1, 4000), //  14 + log2(2 / 4200)   ≈ 2.97
    pair("selten", 1, 1), //     14 + log2(2 / 201)    ≈ 7.35, a hapax
  ],
};

test("attributiveLogDice is 14 + log2(2c / (f_noun + f_adj))", () => {
  assert.equal(attributiveLogDice(8, 8, 8), 14);
  assert.ok(Math.abs(attributiveLogDice(1, 1000, 1000) - (14 + Math.log2(2 / 2000))) < 1e-9);
  assert.equal(attributiveLogDice(0, 100, 100), -Infinity);
});

test("a noun with fewer than 5 adjectives of count >= 5 has no data", () => {
  const kaffee: AdjectiveCounts = {
    nounTotal: 60,
    pairs: [pair("heiß", 20, 500), pair("schwarz", 10, 900), pair("stark", 2, 3000), pair("frisch", 6, 800), pair("gut", 5, 9000)],
  };
  assert.deepEqual(judgeAdjective(idOf("stark"), kaffee), { verdict: "noData", matched: null, suggestions: [] });
});

test("an adjective the noun never takes is not typical, with the top 3 by logDice", () => {
  const j = judgeAdjective(idOf("hoch"), regen);
  assert.equal(j.verdict, "unusual");
  assert.equal(j.matched, null);
  assert.deepEqual(names(j.suggestions), ["strömend", "heftig", "stark"]);
});

test("a rare pair with a common adjective is not typical, however often it occurs", () => {
  const j = judgeAdjective(idOf("warm"), regen); // count 5, logDice 4.98
  assert.equal(j.verdict, "unusual");
  assert.equal(judgeAdjective(idOf("schwer"), regen).verdict, "unusual");
});

test("a hapax adjective is never suggested, but counts as usual when typed", () => {
  const unusual = judgeAdjective(idOf("hoch"), regen);
  assert.ok(!names(unusual.suggestions).includes("selten"));
  const typed = judgeAdjective(idOf("selten"), regen);
  assert.equal(typed.verdict, "usual");
  assert.deepEqual(names(typed.suggestions), ["strömend", "heftig"]);
});

test("usual names at most 2 stronger adjectives, by logDice, not count", () => {
  const stark = judgeAdjective(idOf("stark"), regen);
  assert.equal(stark.verdict, "usual");
  assert.equal(stark.matched?.adjective, "stark");
  assert.deepEqual(names(stark.suggestions), ["strömend", "heftig"]);
  const best = judgeAdjective(idOf("strömend"), regen);
  assert.deepEqual(names(best.suggestions), []);
});

test("unusual with no usual pair at all has no suggestions", () => {
  const general: AdjectiveCounts = {
    nounTotal: 100_000,
    pairs: ["a", "b", "c", "d", "e"].map((a) => pair(a, 10, 50_000)),
  };
  const j = judgeAdjective(idOf("zzz"), general);
  assert.equal(j.verdict, "unusual");
  assert.deepEqual(j.suggestions, []);
});

test("adjectiveCheckPhrase writes the pair as the corpus does", () => {
  assert.deepEqual(adjectiveCheckPhrase({ adjectiveId: 1, adjectiveWord: "starker", nounWord: "Regen" }), {
    phrase: "starker Regen",
    nounWord: "Regen",
    partnerWord: "starker",
  });
});

test("isPositiveForm tells the positive from comparative and superlative forms", () => {
  for (const [surface, lemma] of [
    ["starker", "stark"], ["hohes", "hoch"], ["hohe", "hoch"], ["dunkle", "dunkel"], ["teuren", "teuer"],
    ["leise", "leise"], ["erste", "erster"], ["Erste", "erster"], ["wichtige", "wichtig"],
  ]) {
    assert.equal(isPositiveForm(surface, lemma), true, surface);
  }
  for (const [surface, lemma] of [["höchste", "hoch"], ["wichtigsten", "wichtig"], ["höhere", "hoch"], ["stärkere", "stark"]]) {
    assert.equal(isPositiveForm(surface, lemma), false, surface);
  }
});

test("bestWrittenForm prefers the positive, then the noun's lemma form, then the most examples", () => {
  const form = (adjectiveWord: string, nounWord: string, examples: number) => ({ adjectiveId: 1, adjectiveWord, nounWord, examples });
  assert.deepEqual(
    bestWrittenForm([form("höchste", "Risiko", 2), form("hohen", "Risiken", 1)], "Risiko", "hoch"),
    { adjectiveId: 1, adjectiveWord: "hohen", nounWord: "Risiken" },
  );
  assert.equal(
    bestWrittenForm([form("starken", "Regens", 2), form("starker", "Regen", 1)], "Regen", "stark")?.adjectiveWord,
    "starker",
  );
  assert.equal(bestWrittenForm([], "Regen", "stark"), null);
});

test("positiveEnding is the inflection ending after the positive stem", () => {
  assert.equal(positiveEnding("schwerer", "schwer"), "er");
  assert.equal(positiveEnding("hohes", "hoch"), "es");
  assert.equal(positiveEnding("erste", "erster"), "e");
  assert.equal(positiveEnding("leise", "leise"), "e");
  assert.equal(positiveEnding("stark", "stark"), "");
  assert.equal(positiveEnding("höchste", "hoch"), null);
});

test("bestWrittenForm keeps the typed ending when the examples write it", () => {
  const form = (adjectiveWord: string, nounWord: string, examples: number) => ({ adjectiveId: 1, adjectiveWord, nounWord, examples });
  const forms = [form("starken", "Regen", 3), form("starker", "Regen", 1)];
  assert.equal(bestWrittenForm(forms, "Regen", "stark", "er")?.adjectiveWord, "starker");
});

test("bestWrittenForm prefers a strong ending (-er, -e, -es) over -en and -em", () => {
  const form = (adjectiveWord: string, examples: number) => ({ adjectiveId: 1, adjectiveWord, nounWord: "Regen", examples });
  assert.equal(bestWrittenForm([form("strömendem", 3), form("strömender", 1)], "Regen", "strömend")?.adjectiveWord, "strömender");
  // The typed ending is from another noun's gender: still a strong form first.
  assert.equal(bestWrittenForm([form("strömendem", 3), form("strömender", 1)], "Regen", "strömend", "e")?.adjectiveWord, "strömender");
});

test("bestWrittenForm prefers a lowercase adjective over a name's capital", () => {
  const form = (adjectiveWord: string, examples: number) => ({ adjectiveId: 1, adjectiveWord, nounWord: "Nacht", examples });
  assert.equal(bestWrittenForm([form("Langen", 3), form("lange", 1)], "Nacht", "lang")?.adjectiveWord, "lange");
  assert.equal(bestWrittenForm([form("Erste", 2)], "Hilfe", "erster")?.adjectiveWord, "Erste");
});

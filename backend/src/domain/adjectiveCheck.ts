// Decision #74 (docs/superpowers/specs/2026-11-27-adjective-noun-check-design.md):
// "Passt das zusammen?" for adjective + noun ("schwerer Regen"). Pure
// functions; the service feeds them what the store finds in the #54
// attributive data (adjective_attributes).
//
// The score is a logDice computed *within the attributive relation*: the
// pair's count against the noun's and the adjective's attributive totals.
// It is not the window logDice of lemma_collocations (#43, #44), and the
// two are never merged or ranked together.

import type { CheckPhrase, CheckVerdict } from "@collocations/types";
import { UNUSUAL_SUGGESTIONS, USUAL_SUGGESTIONS } from "./collocationCheck.ts";

/** A pair at or above this attributive logDice is "Üblich". */
export const MIN_ADJECTIVE_CHECK_LOGDICE = 6;
/** Pairs this frequent count for the thin-noun gate and may be suggested. */
export const MIN_ADJECTIVE_PAIR_COUNT = 5;
/** A noun needs this many such pairs, or the verdict is "Keine Daten". */
export const MIN_NOUN_ADJECTIVES = 5;

export interface AdjectiveCount {
  adjectiveId: number;
  /** The adjective lemma. */
  adjective: string;
  /** The pair's count in adjective_attributes. */
  count: number;
  /** f_adj: the adjective's attributive total over all nouns. */
  adjectiveTotal: number;
}

export interface AdjectiveCounts {
  /** f_noun: the noun's attributive total over all its adjectives, no floor. */
  nounTotal: number;
  /** The pairs with count >= MIN_ADJECTIVE_PAIR_COUNT, plus the typed adjective's. */
  pairs: AdjectiveCount[];
}

/** A pair as the corpus writes it ("starken Regen"), from its examples. */
export interface WrittenPair {
  adjectiveId: number;
  adjectiveWord: string;
  nounWord: string;
}

/** One written form of a pair, with how many of its examples use it. */
export interface WrittenForm extends WrittenPair {
  examples: number;
}

export interface AdjectiveJudgement {
  verdict: CheckVerdict;
  matched: AdjectiveCount | null;
  suggestions: AdjectiveCount[];
}

export function attributiveLogDice(count: number, nounTotal: number, adjectiveTotal: number): number {
  return 14 + Math.log2((2 * count) / (nounTotal + adjectiveTotal));
}

/** The verdict on the typed adjective (by lemma id) with a noun's attributive counts. */
export function judgeAdjective(adjectiveId: number, counts: AdjectiveCounts): AdjectiveJudgement {
  const frequent = counts.pairs.filter((p) => p.count >= MIN_ADJECTIVE_PAIR_COUNT);
  if (frequent.length < MIN_NOUN_ADJECTIVES) return { verdict: "noData", matched: null, suggestions: [] };

  const score = (p: AdjectiveCount) => attributiveLogDice(p.count, counts.nounTotal, p.adjectiveTotal);
  // Suggestions are frequent and usual themselves: no hapax adjective (a
  // total of 1-2 gives a high logDice), never a pair the check rejects.
  // logDice decides *whether* a pair is usual; count decides the order, so
  // the commonest phrase comes first ("starker", not "strömender Regen",
  // user 2026-11-27) and "Noch häufiger" is literally true.
  const usual = frequent
    .filter((p) => score(p) >= MIN_ADJECTIVE_CHECK_LOGDICE)
    .sort((a, b) => b.count - a.count || score(b) - score(a) || a.adjective.localeCompare(b.adjective));

  const typed = counts.pairs.find((p) => p.adjectiveId === adjectiveId);
  if (typed === undefined || score(typed) < MIN_ADJECTIVE_CHECK_LOGDICE) {
    return { verdict: "unusual", matched: null, suggestions: usual.slice(0, UNUSUAL_SUGGESTIONS) };
  }
  const moreFrequent = usual.filter((p) => p.adjectiveId !== adjectiveId && p.count > typed.count);
  return { verdict: "usual", matched: typed, suggestions: moreFrequent.slice(0, USUAL_SUGGESTIONS) };
}

export function adjectiveCheckPhrase(written: WrittenPair): CheckPhrase {
  return {
    phrase: `${written.adjectiveWord} ${written.nounWord}`,
    nounWord: written.nounWord,
    partnerWord: written.adjectiveWord,
  };
}

const ENDINGS = ["", "e", "en", "em", "er", "es"];

// The stems a positive (not comparative or superlative) form is built on:
// the lemma itself, and the regular contractions "leise" -> "leis-",
// "hoch" -> "hoh-", "dunkel" -> "dunkl-", "teuer" -> "teur-", and the
// tagger's "-er" ordinal lemmas, "erster" -> "erst-".
function positiveStems(lemma: string): string[] {
  const stems = [lemma];
  if (lemma.endsWith("e")) stems.push(lemma.slice(0, -1));
  if (lemma.endsWith("ch")) stems.push(`${lemma.slice(0, -2)}h`);
  const dropped = /^(.*)e([lr])$/.exec(lemma);
  if (dropped) stems.push(dropped[1] + dropped[2]);
  if (lemma.endsWith("er")) stems.push(lemma.slice(0, -2));
  return stems;
}

/**
 * The inflection ending of a positive-degree form ("schwerer" -> "er",
 * "hohes" -> "es"), the longest that fits; null for a comparative or
 * superlative ("höchste") or a form of another lemma.
 */
export function positiveEnding(surface: string, lemma: string): string | null {
  const word = surface.toLowerCase();
  let best: string | null = null;
  for (const stem of positiveStems(lemma.toLowerCase())) {
    for (const ending of ENDINGS) {
      if (word === stem + ending && (best === null || ending.length > best.length)) best = ending;
    }
  }
  return best;
}

/** Whether a written adjective is its lemma's positive degree ("hohes", not "höchste"). */
export function isPositiveForm(surface: string, lemma: string): boolean {
  return positiveEnding(surface, lemma) !== null;
}

// Strong endings read right without an article ("strömender Regen",
// "gute Chance", "starkes Interesse"); -en/-em mostly need one.
const STRONG_ENDINGS = new Set(["er", "e", "es"]);

/**
 * The form a pair is shown in (reviewer finding: the most frequent form
 * was often a dative or weak one, "strömendem Regen", "berechtigte
 * Interesse"). In order: a positive adjective (not "höchste Risiko"); the
 * ending the learner typed, when the examples write it ("starker Regen"
 * stays "starker"); a strong ending; a lowercase adjective over a name's
 * capital ("lange Nacht", not "Langen Nacht"; "Erste Hilfe" keeps its
 * capital when the corpus never writes it lowercase); the noun's lemma
 * form ("Regen", not "Regens"); then the most examples.
 */
export function bestWrittenForm(
  forms: WrittenForm[],
  nounLemma: string,
  adjectiveLemma: string,
  typedEnding: string | null = null,
): WrittenPair | null {
  const rank = (f: WrittenForm): number[] => {
    const ending = positiveEnding(f.adjectiveWord, adjectiveLemma);
    return [
      ending === null ? 1 : 0,
      typedEnding !== null && ending === typedEnding && f.nounWord === nounLemma ? 0 : 1,
      ending !== null && STRONG_ENDINGS.has(ending) ? 0 : 1,
      f.adjectiveWord[0] === f.adjectiveWord[0].toLowerCase() ? 0 : 1,
      f.nounWord === nounLemma ? 0 : 1,
      -f.examples,
    ];
  };
  const best = [...forms].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return a.adjectiveWord.localeCompare(b.adjectiveWord);
  })[0];
  return best === undefined ? null : { adjectiveId: best.adjectiveId, adjectiveWord: best.adjectiveWord, nounWord: best.nounWord };
}

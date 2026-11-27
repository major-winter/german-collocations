// Decision #76 (plan: docs/superpowers/plans/2026-11-27-prepositional-check.md):
// "Passt das zusammen?" for a verb with a prepositional noun ("an einer
// Sitzung teilnehmen"), from the lab's obl pairs. Pure functions, like
// collocationCheck.ts (#70), whose phrase rules this reuses.

import type { CheckPhrase } from "@collocations/types";
import {
  UNUSUAL_SUGGESTIONS,
  USUAL_SUGGESTIONS,
  baseOf,
  contentWords,
  readingsOf,
  type Judgement,
  type Reading,
  type SplitPhrase,
} from "./collocationCheck.ts";
import { phraseNounWord, phraseOf } from "./verbNounPhrases.ts";

// The LL critical value at p < 0.001 (1 df). Below it a pair is noise:
// "in Einsatz kommen" has LL 1 next to "zum Einsatz kommen" at 18,761.
// Drops 4,045 of the 33,268 local obl pairs.
export const MIN_OBL_SCORE = 10.83;
// A typed preposition counts only at this share of the best preposition
// for the same verb + noun: keeps "sich freuen über Besuch" (421 vs 472),
// drops "auf Einsatz kommen" (3 %) and "vor die Frage stellen" (3 %).
export const PREPOSITION_SHARE_OF_BEST = 0.1;

const PREPOSITIONS = new Set([
  "in", "zu", "auf", "mit", "an", "für", "von", "bei", "nach", "aus", "über", "um", "durch", "unter",
  "vor", "seit", "bis", "ab", "gegen", "wegen", "per", "ohne", "während", "innerhalb", "hinter",
  "zwischen", "neben", "laut", "aufgrund", "pro", "trotz", "außer", "anhand", "gemäß", "außerhalb",
  "binnen", "dank",
]);

const CONTRACTIONS: Record<string, string> = {
  am: "an", ans: "an", im: "in", ins: "in", beim: "bei", vom: "von", zum: "zu", zur: "zu",
  aufs: "auf", fürs: "für", ums: "um", übers: "über", durchs: "durch", unters: "unter",
  unterm: "unter", vors: "vor", vorm: "vor", hinters: "hinter", hinterm: "hinter",
};

const REFLEXIVE_PREFIX = "sich ";

function prepositionOf(token: string): string | null {
  const t = token.toLowerCase();
  return PREPOSITIONS.has(t) ? t : (CONTRACTIONS[t] ?? null);
}

export interface PrepositionalSplit extends SplitPhrase {
  /** The preposition's lemma: "zu" for "zur". */
  preposition: string;
  /** The preposition as typed: "zur". */
  prepositionTyped: string;
}

/**
 * null unless the phrase is a noun, a verb and exactly one preposition
 * once function words are gone. A preposition needs a word after it; a
 * trailing one is a separable particle, as in #70 ("nimmt ein Foto auf").
 */
export function splitPrepositionalPhrase(q: string): PrepositionalSplit | null {
  // #78: the same readings as splitPhrase; an adjective may follow the
  // preposition directly ("an wichtigen Sitzungen").
  for (const reading of readingsOf(q, (t) => prepositionOf(t) !== null)) {
    const split = splitReading(reading);
    if (split !== null) return split;
  }
  return null;
}

function splitReading({ tokens: typed, particle }: Reading): PrepositionalSplit | null {
  const tokens = [...typed];
  const at = tokens.map((t, i) => (i < tokens.length - 1 && prepositionOf(t) !== null ? i : -1)).filter((i) => i >= 0);
  if (at.length !== 1) return null;
  const [prepositionTyped] = tokens.splice(at[0], 1);

  const content = contentWords(tokens);
  if (content === null) return null;
  return { ...content, particle, preposition: prepositionOf(prepositionTyped)!, prepositionTyped };
}

export interface OblPair {
  verb: string;
  prep: string;
  noun: string;
  phraseNoun: string;
  score: number;
}

export interface PrepositionJudgement extends Judgement {
  /** Unusual because the verb takes another preposition with this noun. */
  otherPreposition: boolean;
}

export function oblCheckPhraseOf(pair: OblPair): CheckPhrase {
  return {
    phrase: phraseOf("obl", pair.verb, pair.phraseNoun, pair.noun),
    nounWord: phraseNounWord(pair.phraseNoun),
    partnerWord: baseOf(pair.verb),
  };
}

/**
 * The verdict on `verb` (a base lemma, no "sich") with `preposition` and a
 * noun whose obl pairs come best-first. A typed "sich" means only "sich X";
 * otherwise "X", then "sich X" when X has no pair with the noun (learners
 * drop the "sich": "an der Diskussion beteiligen").
 */
export function judgePreposition(
  verb: string | null,
  sich: boolean,
  preposition: string,
  pairs: OblPair[],
): PrepositionJudgement {
  const kept = pairs.filter((p) => p.score >= MIN_OBL_SCORE);
  if (kept.length === 0) return { verdict: "noData", matched: null, suggestions: [], otherPreposition: false };

  const variants = verb === null ? [] : sich ? [REFLEXIVE_PREFIX + verb] : [verb, REFLEXIVE_PREFIX + verb];
  const verbPairs =
    variants.map((v) => kept.filter((p) => p.verb === v)).find((ps) => ps.length > 0) ?? [];

  if (verbPairs.length > 0) {
    const strong = verbPairs.filter((p) => p.score >= PREPOSITION_SHARE_OF_BEST * verbPairs[0].score);
    const index = strong.findIndex((p) => p.prep === preposition);
    if (index !== -1) {
      return {
        verdict: "usual",
        matched: oblCheckPhraseOf(strong[index]),
        suggestions: strong.slice(0, Math.min(index, USUAL_SUGGESTIONS)).map(oblCheckPhraseOf),
        otherPreposition: false,
      };
    }
    return {
      verdict: "unusual",
      matched: null,
      suggestions: strong.slice(0, UNUSUAL_SUGGESTIONS).map(oblCheckPhraseOf),
      otherPreposition: true,
    };
  }

  const samePreposition = kept.filter((p) => p.prep === preposition);
  return {
    verdict: "unusual",
    matched: null,
    suggestions: (samePreposition.length > 0 ? samePreposition : kept).slice(0, UNUSUAL_SUGGESTIONS).map(oblCheckPhraseOf),
    otherPreposition: false,
  };
}

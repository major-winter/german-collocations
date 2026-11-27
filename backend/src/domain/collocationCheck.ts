// Decision #70 (docs/superpowers/specs/2026-11-26-collocation-check-design.md):
// "Passt das zusammen?" - the rules that turn a typed phrase like "eine
// Entscheidung machen" into a noun, a lab verb lemma and a verdict. Pure
// functions; the service feeds them what the store finds.

import type { CheckPhrase, CheckVerdict } from "@collocations/types";
import { phraseNounWord, phraseOf } from "./verbNounPhrases.ts";

const MIN_TOKENS = 2;
const MAX_TOKENS = 5;

const SEPARABLE_PARTICLES = new Set([
  "ab", "an", "auf", "aus", "bei", "ein", "fest", "mit", "nach", "vor", "weg", "zu", "zurück",
]);

// Articles, "kein" and possessives with any ending: they carry no meaning
// for the check, and keeping them would make every phrase three tokens.
const DETERMINER = /^(der|die|das|den|dem|des|(ein|kein|mein|dein|sein|ihr|unser|euer|eur)(e|en|em|er|es)?)$/i;

const REFLEXIVE_PREFIX = "sich ";

export interface SplitPhrase {
  /** The two remaining words, in typed order: one noun, one verb. */
  words: [string, string];
  /** Whether "sich" was typed. */
  sich: boolean;
  /** A trailing separable particle ("legt eine Pause ein" -> "ein"). */
  particle: string | null;
}

// Learners type "eine Entscheidung treffen?" - the card asks a question.
const EDGE_PUNCTUATION = /^[.,;:!?"'„“”‚‘’»«()]+|[.,;:!?"'„“”‚‘’»«()]+$/g;

function tokensOf(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(EDGE_PUNCTUATION, ""))
    .filter((t) => t !== "");
}

/** The phrase as typed, without surrounding punctuation or extra spaces. */
export function normalisePhrase(q: string): string {
  return tokensOf(q).join(" ");
}

/** null unless the phrase is exactly a noun and a verb once function words are gone. */
export function splitPhrase(q: string): SplitPhrase | null {
  const tokens = tokensOf(q);
  if (tokens.length < MIN_TOKENS || tokens.length > MAX_TOKENS) return null;

  // Before the determiners go: a trailing "ein" is a particle, not an article.
  let particle: string | null = null;
  const last = tokens[tokens.length - 1].toLowerCase();
  if (tokens.length >= 3 && SEPARABLE_PARTICLES.has(last)) {
    particle = last;
    tokens.pop();
  }

  let sich = false;
  const words = tokens.filter((t) => {
    if (t.toLowerCase() === "sich") {
      sich = true;
      return false;
    }
    return !DETERMINER.test(t);
  });
  if (words.length !== 2) return null;
  return { words: [words[0], words[1]], sich, particle };
}

export interface VerbCandidate {
  /** A lab verb lemma, possibly reflexive ("sich machen"). */
  verb: string;
  /** How many example rows use the typed surface for this lemma. */
  uses: number;
}

function baseOf(verb: string): string {
  return verb.startsWith(REFLEXIVE_PREFIX) ? verb.slice(REFLEXIVE_PREFIX.length) : verb;
}

/**
 * The lab verb lemma (without "sich") a typed verb form stands for,
 * resolved without looking at the noun (the learner review: preferring
 * the lemma that pairs with the noun turned "nimmt ein Foto" into
 * "aufnehmen", "Üblich"). A particle verb only stands for a typed
 * particle, attached ("aufnimmt") or trailing ("legt … ein").
 */
export function pickVerbLemma(
  typed: string,
  particle: string | null,
  candidates: VerbCandidate[],
): string | null {
  const word = typed.toLowerCase();
  const uses = new Map<string, number>();
  for (const c of candidates) {
    const base = baseOf(c.verb);
    uses.set(base, (uses.get(base) ?? 0) + c.uses);
  }
  if (!particle && uses.has(word)) return word;

  const bases = [...uses.keys()];
  // "aufnehmen" is prefixed with "auf" when "nehmen" is also a candidate.
  const prefixOf = (b: string): string | null => {
    const shorter = bases
      .filter((d) => d !== b && b.endsWith(d))
      .sort((x, y) => y.length - x.length)[0];
    return shorter === undefined ? null : b.slice(0, -shorter.length);
  };

  let eligible: string[];
  if (particle) {
    eligible = bases.filter((b) => {
      const prefix = prefixOf(b);
      return prefix === particle || (prefix === null && b.startsWith(particle) && b !== particle);
    });
  } else {
    const attached = bases.filter((b) => {
      const prefix = prefixOf(b);
      return prefix !== null && word.startsWith(prefix);
    });
    eligible = attached.length > 0 ? attached : bases.filter((b) => prefixOf(b) === null);
  }

  eligible.sort((a, b) => uses.get(b)! - uses.get(a)! || a.localeCompare(b));
  return eligible[0] ?? null;
}

// A typed plain verb may match its "sich" pair only this high in the
// noun's object list (spec: "eine Entscheidung machen" must not match
// "sich machen", rank 44; "Mühe geben" matches "sich geben", rank 1).
export const REFLEXIVE_TOP_N = 10;
// The subject-error filter applies only to verbs whose object pairs make
// up less than this share of their object + subject pair frequency
// (spec: keeps "Bus fahren" at 0.41, drops "Entscheidung fallen" at 0.15).
export const SUBJECT_FILTER_MAX_OBJECT_SHARE = 0.4;
export const USUAL_SUGGESTIONS = 2;
export const UNUSUAL_SUGGESTIONS = 3;

export interface CheckPair {
  verb: string;
  noun: string;
  phraseNoun: string;
  score: number;
  /** The same verb + noun's subject-pair score, when there is one. */
  subjectScore: number | null;
  /** The verb's object share; only filled in when subjectScore > score. */
  verbObjectShare: number | null;
}

export interface Judgement {
  verdict: CheckVerdict;
  matched: CheckPhrase | null;
  suggestions: CheckPhrase[];
}

export function checkPhraseOf(pair: CheckPair): CheckPhrase {
  return {
    phrase: phraseOf("obj", pair.verb, pair.phraseNoun, pair.noun),
    nounWord: phraseNounWord(pair.phraseNoun),
    partnerWord: baseOf(pair.verb),
  };
}

function isSubjectError(pair: CheckPair): boolean {
  return (
    pair.subjectScore !== null &&
    pair.subjectScore > pair.score &&
    pair.verbObjectShare !== null &&
    pair.verbObjectShare < SUBJECT_FILTER_MAX_OBJECT_SHARE
  );
}

/** The verdict on `verb` (a base lemma, no "sich") with a noun whose object pairs come best-first. */
export function judge(verb: string | null, sich: boolean, pairs: CheckPair[]): Judgement {
  const kept = pairs.filter((p) => !isSubjectError(p));
  if (kept.length === 0) return { verdict: "noData", matched: null, suggestions: [] };

  let index = -1;
  if (verb !== null) {
    const reflexive = kept.findIndex((p) => p.verb === REFLEXIVE_PREFIX + verb);
    if (sich) {
      index = reflexive;
    } else {
      index = kept.findIndex((p) => p.verb === verb);
      if (index === -1 && reflexive !== -1 && reflexive < REFLEXIVE_TOP_N) index = reflexive;
    }
  }

  if (index === -1) {
    return {
      verdict: "unusual",
      matched: null,
      suggestions: kept.slice(0, UNUSUAL_SUGGESTIONS).map(checkPhraseOf),
    };
  }
  return {
    verdict: "usual",
    matched: checkPhraseOf(kept[index]),
    suggestions: kept.slice(0, Math.min(index, USUAL_SUGGESTIONS)).map(checkPhraseOf),
  };
}

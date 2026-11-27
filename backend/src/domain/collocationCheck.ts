// Decision #70 (docs/superpowers/specs/2026-11-26-collocation-check-design.md):
// "Passt das zusammen?" - the rules that turn a typed phrase like "eine
// Entscheidung machen" into a noun, a lab verb lemma and a verdict. Pure
// functions; the service feeds them what the store finds.

import type { CheckPhrase, CheckVerdict } from "@collocations/types";
import { phraseNounWord, phraseOf } from "./verbNounPhrases.ts";

const MIN_TOKENS = 2;
// #78: 8, not #70's 5, so a learner's sentence fits: "Ich nehme an einer
// wichtigen Sitzung teil" is 7 words.
const MAX_TOKENS = 8;

const SEPARABLE_PARTICLES = new Set([
  "ab", "an", "auf", "aus", "bei", "ein", "fest", "mit", "nach", "vor", "weg", "zu", "zurück",
  // #78: every particle the lab examples write split from its verb at least
  // 50 times ("nimmt … teil" 482, "stellt … dar" 586). Not "statt": the noun
  // of "stattfinden" is its subject, which the check does not judge.
  "auseinander", "bereit", "dar", "durch", "entgegen", "fort", "frei", "her", "hervor", "heraus",
  "hin", "hinzu", "nieder", "offen", "teil", "um", "über", "voran", "wahr", "weiter", "zusammen",
]);

// Articles, "kein" and possessives with any ending: they carry no meaning
// for the check, and keeping them would make every phrase three tokens.
const DETERMINER = /^(der|die|das|den|dem|des|(ein|kein|mein|dein|sein|ihr|unser|euer|eur)(e|en|em|er|es)?)$/i;

const REFLEXIVE_PREFIX = "sich ";

// #78: a subject pronoun carries nothing for the check ("wir treffen eine
// Entscheidung"). "ihr" is also a possessive, already dropped as one.
const SUBJECT_PRONOUNS = new Set(["ich", "du", "er", "sie", "es", "wir", "ihr", "man"]);
// The reflexive forms that agree with a subject pronoun: "ich mache mir
// Sorgen" is "(sich) Sorgen machen". Without its subject, "mir" is an object.
const REFLEXIVES_OF: Record<string, string[]> = { ich: ["mich", "mir"], du: ["dich", "dir"], wir: ["uns"], ihr: ["euch"] };
// "es gibt" is existential; the lab extracts no objects for it (#64), so
// "es gibt keine Lösung" would be judged as "Lösung geben".
const GEBEN_FORMS = new Set(["gibt", "gab", "gäbe", "gaben", "geben", "gegeben"]);
// #78: demonstratives and quantifiers, dropped like articles in a learner
// reading ("Ich verbringe viel Zeit", "diese Entscheidung treffen"). Only
// there, so "viele Fragen" stays a #74 adjective check. Not "einig-":
// "einigen" is also a verb form ("wir einigen uns").
const LEARNER_DETERMINER = /^(dies|jed|jen|manch|welch|solch|viel|wenig|mehrer|all|beid)(e|en|em|er|es)?$/i;
// #78: only these words are dropped between a determiner and its noun: an
// adjective ending, or an intensifier. Never a verb ("Ich denke das macht
// Sinn") or a preposition ("das in Kauf nehmen"; review findings).
const ATTRIBUTIVE_ENDING = /(e|en|er|es|em)$/i;
const INTENSIFIERS = new Set([
  "sehr", "ganz", "besonders", "wirklich", "ziemlich", "total", "echt", "so", "extrem", "recht", "richtig", "äußerst",
]);

// #76's prepositions, here since #78 so no reading drops one as an adjective.
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

/** A preposition's lemma ("zu" for "zur"), or null. */
export function prepositionOf(token: string): string | null {
  const t = token.toLowerCase();
  return PREPOSITIONS.has(t) ? t : (CONTRACTIONS[t] ?? null);
}

export interface SplitPhrase {
  /** The two remaining words, in typed order: one noun, one verb. */
  words: [string, string];
  /** Whether "sich" was typed. */
  sich: boolean;
  /** A trailing separable particle ("legt eine Pause ein" -> "ein"). */
  particle: string | null;
  /**
   * #78: a reflexive agreeing with the subject was dropped ("ich hole mir
   * Unterstützung"): its sich pair counts at any rank. Absent when false.
   */
  reflexiveDropped?: true;
}

// Learners type "eine Entscheidung treffen?" - the card asks a question.
const EDGE_PUNCTUATION = /^[.,;:!?"'„“”‚‘’»«()]+|[.,;:!?"'„“”‚‘’»«()]+$/g;

function rawTokens(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(EDGE_PUNCTUATION, ""))
    .filter((t) => t !== "");
}

/** The typed tokens, without edge punctuation; null outside the 2–5 token bounds. */
export function tokensOf(q: string): string[] | null {
  const tokens = rawTokens(q);
  return tokens.length < MIN_TOKENS || tokens.length > MAX_TOKENS ? null : tokens;
}

/** The phrase as typed, without surrounding punctuation or extra spaces. */
export function normalisePhrase(q: string): string {
  return rawTokens(q).join(" ");
}

/**
 * Pops a trailing separable particle - before the determiners go, so a
 * trailing "ein" is a particle, not an article. Mutates `tokens`.
 */
export function popParticle(tokens: string[]): string | null {
  const typed = tokens[tokens.length - 1];
  const last = typed.toLowerCase();
  // #78: a capitalised trailing word is a noun ("den ersten Teil", "ein
  // schönes Fest", "ebnet den Weg"), never a particle.
  if (tokens.length >= 3 && typed === last && SEPARABLE_PARTICLES.has(last)) {
    tokens.pop();
    return last;
  }
  return null;
}

/** The two words left once "sich" and determiners are gone, or null. */
export function contentWords(tokens: string[]): { words: [string, string]; sich: boolean } | null {
  let sich = false;
  const words = tokens.filter((t) => {
    if (t.toLowerCase() === "sich") {
      sich = true;
      return false;
    }
    return !DETERMINER.test(t);
  });
  if (words.length !== 2) return null;
  return { words: [words[0], words[1]], sich };
}

export function isDeterminer(token: string): boolean {
  return DETERMINER.test(token);
}

function isCapitalised(token: string): boolean {
  return token[0] !== token[0].toLowerCase();
}

/**
 * #78: the subject pronoun goes, and so does a reflexive that agrees with
 * it ("ich freue mich"). The reflexive is not read as a typed "sich":
 * "mir", "uns" are often free datives ("ich mache mir einen Kaffee"), and
 * the sich pair still counts, at any rank (`reflexiveDropped`).
 */
export function dropSubjectPronouns(tokens: string[]): { tokens: string[]; reflexiveDropped: boolean } {
  const lower = tokens.map((t) => t.toLowerCase());
  const reflexives = new Set(lower.flatMap((t) => REFLEXIVES_OF[t] ?? []));
  return {
    tokens: tokens.filter((_, i) => !SUBJECT_PRONOUNS.has(lower[i]) && !reflexives.has(lower[i])),
    reflexiveDropped: lower.some((t) => reflexives.has(t)),
  };
}

function looksAttributive(token: string): boolean {
  return ATTRIBUTIVE_ENDING.test(token) || INTENSIFIERS.has(token.toLowerCase());
}

/**
 * #78: drops the lowercase words between an opener (a determiner, a
 * preposition, or `isOpener`) and the capitalised noun after them, when
 * each looks attributive: "eine (sehr) schwere Entscheidung", "an
 * wichtigen Sitzungen". An opener itself is never dropped ("bis zum
 * Ende", "das in Kauf nehmen"). Returns a new array.
 */
export function dropAttributiveAdjectives(tokens: string[], isOpener: (token: string) => boolean = () => false): string[] {
  const opens = (t: string) => isDeterminer(t) || prepositionOf(t) !== null || isOpener(t);
  const drop = new Set<number>();
  for (let start = 0; start < tokens.length; start++) {
    if (!opens(tokens[start])) continue;
    let end = start + 1;
    while (end < tokens.length && !isCapitalised(tokens[end]) && !opens(tokens[end]) && looksAttributive(tokens[end])) {
      end++;
    }
    if (end > start + 1 && end < tokens.length && isCapitalised(tokens[end])) {
      for (let i = start + 1; i < end; i++) drop.add(i);
    }
  }
  return tokens.filter((_, i) => !drop.has(i));
}

export interface Reading {
  tokens: string[];
  particle: string | null;
  reflexiveDropped: boolean;
}

/**
 * The ways to read a phrase, in order. First as #70 read it, so every
 * phrase it parsed keeps its parse; then without popping a trailing word
 * that is also a particle ("bekommt einen Teil"); then as a learner's
 * sentence (#78): without the subject pronoun, with and then without
 * dropping the adjectives inside the noun phrase. Callers take the first
 * reading that parses.
 */
export function readingsOf(q: string): Reading[] {
  const tokens = tokensOf(q);
  if (tokens === null) return [];
  const existential =
    tokens.some((t) => t.toLowerCase() === "es") && tokens.some((t) => GEBEN_FORMS.has(t.toLowerCase()));
  // Lowercase, or the first word: a capitalised "All" elsewhere is the noun.
  const isLearnerDeterminer = (t: string) => LEARNER_DETERMINER.test(t) && (t === t.toLowerCase() || t === tokens[0]);
  const readings: Reading[] = [];
  for (const learner of existential ? [false] : [false, true]) {
    for (const pop of [true, false]) {
      const rest = [...tokens];
      const particle = pop ? popParticle(rest) : null;
      if (!pop && popParticle([...tokens]) === null) continue; // the same as the reading with pop
      if (!learner) {
        readings.push({ tokens: rest, particle, reflexiveDropped: false });
        continue;
      }
      const { tokens: withoutPronouns, reflexiveDropped } = dropSubjectPronouns(rest);
      const withoutAdjectives = dropAttributiveAdjectives(withoutPronouns, isLearnerDeterminer);
      for (const reduced of [withoutAdjectives, withoutPronouns]) {
        readings.push({ tokens: reduced.filter((t) => !isLearnerDeterminer(t)), particle, reflexiveDropped });
      }
    }
  }
  return readings;
}

/** null unless the phrase is exactly a noun and a verb once function words are gone. */
export function splitPhrase(q: string): SplitPhrase | null {
  for (const { tokens, particle, reflexiveDropped } of readingsOf(q)) {
    const content = contentWords(tokens);
    if (content !== null) return { ...content, particle, ...(reflexiveDropped ? { reflexiveDropped: true as const } : {}) };
  }
  return null;
}

export interface VerbCandidate {
  /** A lab verb lemma, possibly reflexive ("sich machen"). */
  verb: string;
  /** How many example rows use the typed surface for this lemma. */
  uses: number;
}

/** The verb lemma without its "sich". */
export function baseOf(verb: string): string {
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
export function judge(verb: string | null, sich: boolean, pairs: CheckPair[], reflexiveDropped = false): Judgement {
  const kept = pairs.filter((p) => !isSubjectError(p));
  if (kept.length === 0) return { verdict: "noData", matched: null, suggestions: [] };

  let index = -1;
  if (verb !== null) {
    const reflexive = kept.findIndex((p) => p.verb === REFLEXIVE_PREFIX + verb);
    if (sich) {
      index = reflexive;
    } else {
      index = kept.findIndex((p) => p.verb === verb);
      // #78: a dropped "mir"/"uns" was a reflexive the learner did type.
      if (index === -1 && reflexive !== -1 && (reflexive < REFLEXIVE_TOP_N || reflexiveDropped)) index = reflexive;
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

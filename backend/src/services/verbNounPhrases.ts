import type { VerbNounRelation } from "@collocations/types";

// Decision #60 (docs/decisions.md): how a collocation-lab pair is
// labelled on a noun or verb page. Lemmas only - the app has no verb
// conjugation or noun gender data, so "sich richten", not "richtet sich".

export type PageSide = "noun" | "verb";

const REFLEXIVE_PREFIX = "sich ";

/** Which side of a lab pair the searched word is on, from its dominant POS. */
export function pageSide(pos: string | null): PageSide | null {
  if (pos === "NOUN") return "noun";
  if (pos === "VERB" || pos === "AUX") return "verb";
  return null;
}

/**
 * The pair as a learner would say it: "Kritik üben", "in der Kritik
 * stehen". A reflexive lab verb ("sich geben") puts its "sich" in front
 * of the noun phrase: "sich Mühe geben". A subject pair is "Kritik …
 * sich richten", since the verb's own object or complement is unknown.
 */
export function phraseOf(
  relation: VerbNounRelation,
  verb: string,
  phraseNoun: string,
  noun: string,
): string {
  if (relation === "nsubj") return `${noun} … ${verb}`;
  if (verb.startsWith(REFLEXIVE_PREFIX)) {
    return `${REFLEXIVE_PREFIX}${phraseNoun} ${verb.slice(REFLEXIVE_PREFIX.length)}`;
  }
  return `${phraseNoun} ${verb}`;
}

/**
 * The chip's short label: the partner, plus the preposition for an obl
 * pair - "in der … stehen" on the noun page, "in Geduld" on the verb page.
 */
export function chipOf(
  side: PageSide,
  relation: VerbNounRelation,
  verb: string,
  phraseNoun: string,
  noun: string,
): string {
  if (side === "verb") return relation === "obl" ? phraseNoun : noun;
  if (relation !== "obl") return verb;

  const words = phraseNoun.split(" ");
  const phraseWithoutNoun = [...words.slice(0, -1), "…"].join(" ");
  return phraseOf(relation, verb, phraseWithoutNoun, noun);
}

/**
 * The lemma texts to look the searched word up under, in order: the word
 * itself (it may be a lab lemma even where the app's own lemma is wrong),
 * then its dominant lemma's text.
 */
export function lookupCandidates(searchedWord: string, lemmaText: string | null): string[] {
  return lemmaText && lemmaText !== searchedWord ? [searchedWord, lemmaText] : [searchedWord];
}

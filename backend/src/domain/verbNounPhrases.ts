import type { VerbNounRelation } from "@collocations/types";

// Decisions #60 and #69 (docs/decisions.md): how a collocation-lab pair
// is labelled on a noun or verb page. Verbs stay lemmas ("sich richten",
// not "richtet sich"); the noun phrase is the corpus's most common written
// form ("keine Ahnung"), and a lone noun on a verb-page chip carries its
// article when the lab knows it ("die Frage").

export type PageSide = "noun" | "verb";

const REFLEXIVE_PREFIX = "sich ";

/** Which side of a lab pair the searched word is on, from its dominant POS. */
export function pageSide(pos: string | null): PageSide | null {
  if (pos === "NOUN") return "noun";
  if (pos === "VERB" || pos === "AUX") return "verb";
  return null;
}

/**
 * The pair as a learner would say it: "keine Ahnung haben", "in der
 * Kritik stehen". A reflexive lab verb ("sich geben") puts its "sich" in
 * front of the noun phrase: "sich Mühe geben". A subject pair is "die
 * Kritik … sich richten", since the verb's own object or complement is
 * unknown.
 */
export function phraseOf(
  relation: VerbNounRelation,
  verb: string,
  phraseNoun: string,
  noun: string,
): string {
  if (relation === "nsubj") return `${phraseNoun} … ${verb}`;
  if (verb.startsWith(REFLEXIVE_PREFIX)) {
    return `${REFLEXIVE_PREFIX}${phraseNoun} ${verb.slice(REFLEXIVE_PREFIX.length)}`;
  }
  return `${phraseNoun} ${verb}`;
}

/**
 * The chip's short label: the partner, plus the preposition for an obl
 * pair - "in der … stehen" on the noun page, "in Geduld" on the verb page.
 * A verb page also lists the reflexive "sich X" pairs, so their chips
 * carry the "sich" ("sich die Frage", "die Information (sich)") -
 * otherwise "Frage stellen" and "sich Frage stellen" get two identical
 * chips. A verb page's obj/nsubj chip puts the noun's article, when
 * known, in front of the noun (#69).
 */
export function chipOf(
  side: PageSide,
  relation: VerbNounRelation,
  verb: string,
  phraseNoun: string,
  noun: string,
  nounArticle: string | null,
): string {
  if (side === "verb") {
    const partner =
      relation === "obl" ? phraseNoun : nounArticle ? `${nounArticle} ${noun}` : noun;
    if (!verb.startsWith(REFLEXIVE_PREFIX)) return partner;
    return relation === "nsubj" ? `${partner} (sich)` : `${REFLEXIVE_PREFIX}${partner}`;
  }
  if (relation !== "obl") return verb;

  const words = phraseNoun.split(" ");
  const phraseWithoutNoun = [...words.slice(0, -1), "…"].join(" ");
  return phraseOf(relation, verb, phraseWithoutNoun, noun);
}

/** The noun as written in the phrase - its last word ("in der Kritik" -> "Kritik"), for highlighting. */
export function phraseNounWord(phraseNoun: string): string {
  return phraseNoun.split(" ").at(-1) ?? phraseNoun;
}

/**
 * The lemma texts to look the searched word up under, in order: the word
 * itself (it may be a lab lemma even where the app's own lemma is wrong),
 * then its dominant lemma's text.
 */
export function lookupCandidates(searchedWord: string, lemmaText: string | null): string[] {
  return lemmaText && lemmaText !== searchedWord ? [searchedWord, lemmaText] : [searchedWord];
}

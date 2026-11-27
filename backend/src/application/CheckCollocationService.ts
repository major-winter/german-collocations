import type { CollocationCheck } from "@collocations/types";
import {
  baseOf,
  judge,
  normalisePhrase,
  pickVerbLemma,
  splitPhrase,
  type VerbCandidate,
} from "../domain/collocationCheck.ts";
import {
  adjectiveCheckPhrase,
  bestWrittenForm,
  isPositiveForm,
  judgeAdjective,
  positiveEnding,
  type AdjectiveCount,
} from "../domain/adjectiveCheck.ts";
import { judgePreposition, splitPrepositionalPhrase, type PrepositionalSplit } from "../domain/prepositionCheck.ts";
import { lookupCandidates, pageSide } from "../domain/verbNounPhrases.ts";
import type { CheckCollocation } from "./ports/in/CheckCollocation.ts";
import type { AdjectiveLemma, CollocationCheckStore } from "./ports/out/CollocationCheckStore.ts";

const NOT_PARSED: CollocationCheck = { parsed: false };

function isCapitalised(word: string): boolean {
  return word[0] !== word[0].toLowerCase();
}

function capitalise(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}

type Split = NonNullable<ReturnType<typeof splitPhrase>>;

// Decision #70: "Passt das zusammen?" for a typed verb–noun phrase; #74
// adds adjective + noun, #76 a verb with a prepositional noun.
export class CheckCollocationService implements CheckCollocation {
  #store: CollocationCheckStore;
  constructor(store: CollocationCheckStore) {
    this.#store = store;
  }

  async check(q: string): Promise<CollocationCheck> {
    const split = splitPhrase(q);
    if (split === null) {
      // #76: only phrases the verb and adjective checks cannot parse, so
      // none of their verdicts changes.
      const prepositional = splitPrepositionalPhrase(q);
      return (prepositional && (await this.#oblCheck(q, prepositional))) ?? NOT_PARSED;
    }

    // The verb branch first, exactly as in #70; the adjective branch only
    // gets the phrases it does not parse, so no verb check changes.
    const adjectiveAllowed = split.particle === null && !split.sich;
    const verbCheck = await this.#verbCheck(q, split);
    if (verbCheck !== null) {
      // Review finding: "bekannte Frage" read "bekannte" as "bekennen". The
      // partner is the adjective when the verb reading is not usual and the
      // form is mostly tagged ADJ, in either word order (#75: the card's
      // field sends "Frage bekannte", the search box "bekannte Frage", and
      // both must agree). Not when the adjective reading is merely usual:
      // tagger errors give verbs tiny attributive totals, so high logDice
      // ("macht" -> "machen"). A usual verb check never changes.
      if (adjectiveAllowed && verbCheck.verdict !== "usual") {
        const adjectiveCheck = await this.#adjectiveCheck(q, split.words);
        if (adjectiveCheck?.mostlyAdjective) {
          return adjectiveCheck.check;
        }
      }
      return verbCheck;
    }
    if (!adjectiveAllowed) return NOT_PARSED;
    return (await this.#adjectiveCheck(q, split.words))?.check ?? NOT_PARSED;
  }

  async #verbCheck(q: string, split: Split): Promise<Extract<CollocationCheck, { relation: "obj" }> | null> {
    const roles = await this.#roles(split.words);
    if (roles === null) return null;
    const { nounToken, verbToken, verbCandidates } = roles;

    // Phones type "entscheidung": the page is under the capitalised form.
    const nounForm = capitalise(nounToken);
    const headword = await this.#store.resolveHeadword(nounForm);
    if (headword === null || pageSide(headword.pos) !== "noun") return null;

    const verb = await this.#verbLemma(verbToken, split.particle, verbCandidates);
    // #78: a trailing particle the typed verb has no particle verb for is
    // more likely a predicative adjective ("Die Frage ist offen") or a word
    // we cannot read than a wrong verb: not parsed, never "Nicht typisch".
    if (verb === null && split.particle !== null) return null;
    const { noun, pairs } = await this.#pairsOf(nounForm, headword.lemma?.text ?? null, (n) => this.#store.findObjectPairs(n));
    const { verdict, matched, suggestions } = judge(verb, split.sich, pairs);

    return {
      parsed: true,
      phrase: normalisePhrase(q),
      noun,
      verbTyped: verbToken,
      verb,
      relation: "obj",
      verdict,
      matched,
      suggestions,
    };
  }

  // Decision #76: the same roles and verb lemma as #verbCheck, judged
  // against the noun's obl pairs.
  async #oblCheck(q: string, split: PrepositionalSplit): Promise<Extract<CollocationCheck, { relation: "obl" }> | null> {
    const roles = await this.#roles(split.words);
    if (roles === null) return null;
    const { nounToken, verbToken, verbCandidates } = roles;

    const nounForm = capitalise(nounToken);
    const headword = await this.#store.resolveHeadword(nounForm);
    if (headword === null || pageSide(headword.pos) !== "noun") return null;

    const verb = await this.#verbLemma(verbToken, split.particle, verbCandidates);
    if (verb === null && split.particle !== null) return null; // #78, as in #verbCheck
    const { noun, pairs } = await this.#pairsOf(nounForm, headword.lemma?.text ?? null, (n) => this.#store.findOblPairs(n));
    const { verdict, matched, suggestions, otherPreposition } = judgePreposition(verb, split.sich, split.preposition, pairs);

    return {
      parsed: true,
      phrase: normalisePhrase(q),
      noun,
      verbTyped: verbToken,
      verb,
      prepositionTyped: split.prepositionTyped,
      preposition: split.preposition,
      relation: "obl",
      verdict,
      otherPreposition,
      matched,
      suggestions,
    };
  }

  // Decision #74. With exactly one capitalised word, that word is the noun;
  // otherwise both orders are tried, the typed one first (German puts the
  // attributive adjective before its noun): "Starker Regen", "hohe kosten".
  async #adjectiveCheck(
    q: string,
    [a, b]: [string, string],
  ): Promise<{ check: Extract<CollocationCheck, { relation: "amod" }>; mostlyAdjective: boolean } | null> {
    const orders: [string, string][] =
      isCapitalised(a) !== isCapitalised(b) ? [isCapitalised(a) ? [b, a] : [a, b]] : [[a, b], [b, a]];
    for (const [adjectiveToken, nounToken] of orders) {
      const roles = await this.#adjectiveRoles(adjectiveToken, nounToken);
      if (roles === null) continue;
      const { adjective, noun } = roles;

      const counts = await this.#store.findAdjectiveCounts(noun.id, adjective.id);
      const judgement = judgeAdjective(adjective.id, counts);
      const shown = [...(judgement.matched ? [judgement.matched] : []), ...judgement.suggestions];
      const forms =
        shown.length === 0 ? [] : await this.#store.findWrittenForms(noun.id, shown.map((p) => p.adjectiveId));
      // The typed ending carries the noun's gender and case: "schwerer Regen"
      // suggests "strömender Regen" when the examples write it.
      const typedEnding = positiveEnding(adjectiveToken, adjective.lemma);
      const phraseOf = (pair: AdjectiveCount, positiveOnly = false) => {
        const own = forms.filter((f) => f.adjectiveId === pair.adjectiveId);
        const written = bestWrittenForm(own, noun.text, pair.adjective, typedEnding);
        if (written === null) return null;
        if (positiveOnly && !isPositiveForm(written.adjectiveWord, pair.adjective)) return null;
        return adjectiveCheckPhrase(written);
      };

      const check: Extract<CollocationCheck, { relation: "amod" }> = {
        parsed: true,
        phrase: normalisePhrase(q),
        noun: noun.text,
        adjectiveTyped: adjectiveToken,
        adjective: adjective.lemma,
        relation: "amod",
        verdict: judgement.verdict,
        // Without a positive example ("hoher Preis" is only written "höhere
        // Preise") the card shows the phrase as typed.
        matched: judgement.matched ? phraseOf(judgement.matched, true) : null,
        // Never a bare lemma pair ("stark Regen"): no example, no suggestion.
        suggestions: judgement.suggestions.map((p) => phraseOf(p)).filter((p) => p !== null),
      };
      return { check, mostlyAdjective: adjective.mostlyAdjective };
    }
    return null;
  }

  async #adjectiveRoles(
    adjectiveToken: string,
    nounToken: string,
  ): Promise<{ adjective: AdjectiveLemma; noun: { id: number; text: string } } | null> {
    const [adjective, headword] = await Promise.all([
      this.#store.findAdjectiveLemma(adjectiveToken.toLowerCase()),
      this.#store.resolveHeadword(capitalise(nounToken)),
    ]);
    if (adjective === null || headword?.lemma == null || pageSide(headword.pos) !== "noun") return null;
    return { adjective, noun: headword.lemma };
  }

  // Exactly one capitalised word is the noun. Otherwise (all lowercase,
  // or a sentence-initial capital) the noun is the word that is no verb form.
  async #roles(
    words: [string, string],
  ): Promise<{ nounToken: string; verbToken: string; verbCandidates: VerbCandidate[] } | null> {
    const [a, b] = words;
    if (isCapitalised(a) !== isCapitalised(b)) {
      const [nounToken, verbToken] = isCapitalised(a) ? [a, b] : [b, a];
      const verbCandidates = await this.#store.findVerbCandidates(verbToken.toLowerCase());
      // "erste Hilfe", "gute Nacht": no verb at all, so a plain search, not
      // a "Nicht typisch" verdict (final review I1).
      if (verbCandidates.length === 0) return null;
      return { nounToken, verbToken, verbCandidates };
    }
    const [forA, forB] = await Promise.all([
      this.#store.findVerbCandidates(a.toLowerCase()),
      this.#store.findVerbCandidates(b.toLowerCase()),
    ]);
    if ((forA.length > 0) === (forB.length > 0)) return null;
    return forA.length > 0
      ? { nounToken: b, verbToken: a, verbCandidates: forA }
      : { nounToken: a, verbToken: b, verbCandidates: forB };
  }

  // #70's pickVerbLemma, without looking at the noun. #78: the examples are
  // news-heavy, so a first-person form may never be written with its
  // particle verb ("nehme … auf"). Then particle + the form's own lemma
  // ("auf" + "nehmen") is the particle verb, when the lab has that verb.
  async #verbLemma(verbToken: string, particle: string | null, candidates: VerbCandidate[]): Promise<string | null> {
    const verb = pickVerbLemma(verbToken, particle, candidates);
    if (verb !== null || particle === null) return verb;
    const base = pickVerbLemma(verbToken, null, candidates);
    if (base === null) return null;
    const composed = particle + base;
    const known = await this.#store.findVerbCandidates(composed);
    return known.some((c) => baseOf(c.verb) === composed) ? composed : null;
  }

  // Same order as the noun page (#60): the typed form, then its lemma.
  async #pairsOf<P>(
    form: string,
    lemmaText: string | null,
    find: (noun: string) => Promise<P[]>,
  ): Promise<{ noun: string; pairs: P[] }> {
    for (const candidate of lookupCandidates(form, lemmaText)) {
      const pairs = await find(candidate);
      if (pairs.length > 0) return { noun: candidate, pairs };
    }
    return { noun: form, pairs: [] };
  }
}

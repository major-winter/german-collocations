import type { CollocationCheck } from "@collocations/types";
import {
  judge,
  normalisePhrase,
  pickVerbLemma,
  splitPhrase,
  type CheckPair,
  type VerbCandidate,
} from "../domain/collocationCheck.ts";
import {
  adjectiveCheckPhrase,
  bestWrittenForm,
  isPositiveForm,
  judgeAdjective,
  type AdjectiveCount,
} from "../domain/adjectiveCheck.ts";
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
// adds adjective + noun.
export class CheckCollocationService implements CheckCollocation {
  #store: CollocationCheckStore;
  constructor(store: CollocationCheckStore) {
    this.#store = store;
  }

  async check(q: string): Promise<CollocationCheck> {
    const split = splitPhrase(q);
    if (split === null) return NOT_PARSED;

    // The verb branch first, exactly as in #70; the adjective branch only
    // gets the phrases it does not parse, so no verb check changes.
    const verbCheck = await this.#verbCheck(q, split);
    if (verbCheck !== null) return verbCheck;
    if (split.particle !== null || split.sich) return NOT_PARSED;
    return (await this.#adjectiveCheck(q, split.words)) ?? NOT_PARSED;
  }

  async #verbCheck(q: string, split: Split): Promise<CollocationCheck | null> {
    const roles = await this.#roles(split.words);
    if (roles === null) return null;
    const { nounToken, verbToken, verbCandidates } = roles;

    // Phones type "entscheidung": the page is under the capitalised form.
    const nounForm = capitalise(nounToken);
    const headword = await this.#store.resolveHeadword(nounForm);
    if (headword === null || pageSide(headword.pos) !== "noun") return null;

    const verb = pickVerbLemma(verbToken, split.particle, verbCandidates);
    const { noun, pairs } = await this.#objectPairs(nounForm, headword.lemma?.text ?? null);
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

  // Decision #74. With exactly one capitalised word, that word is the noun;
  // otherwise both orders are tried, the typed one first (German puts the
  // attributive adjective before its noun): "Starker Regen", "hohe kosten".
  async #adjectiveCheck(q: string, [a, b]: [string, string]): Promise<CollocationCheck | null> {
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
      const phraseOf = (pair: AdjectiveCount, positiveOnly = false) => {
        const own = forms.filter((f) => f.adjectiveId === pair.adjectiveId);
        const written = bestWrittenForm(own, noun.text, pair.adjective);
        if (written === null) return null;
        if (positiveOnly && !isPositiveForm(written.adjectiveWord, pair.adjective)) return null;
        return adjectiveCheckPhrase(written);
      };

      return {
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

  // Same order as the noun page (#60): the typed form, then its lemma.
  async #objectPairs(form: string, lemmaText: string | null): Promise<{ noun: string; pairs: CheckPair[] }> {
    for (const candidate of lookupCandidates(form, lemmaText)) {
      const pairs = await this.#store.findObjectPairs(candidate);
      if (pairs.length > 0) return { noun: candidate, pairs };
    }
    return { noun: form, pairs: [] };
  }
}

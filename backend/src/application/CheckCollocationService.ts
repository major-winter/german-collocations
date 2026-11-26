import type { CollocationCheck } from "@collocations/types";
import {
  judge,
  normalisePhrase,
  pickVerbLemma,
  splitPhrase,
  type CheckPair,
  type VerbCandidate,
} from "../domain/collocationCheck.ts";
import { lookupCandidates, pageSide } from "../domain/verbNounPhrases.ts";
import type { CheckCollocation } from "./ports/in/CheckCollocation.ts";
import type { CollocationCheckStore } from "./ports/out/CollocationCheckStore.ts";

const NOT_PARSED: CollocationCheck = { parsed: false };

function isCapitalised(word: string): boolean {
  return word[0] !== word[0].toLowerCase();
}

function capitalise(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}

// Decision #70: "Passt das zusammen?" for a typed verb–noun phrase.
export class CheckCollocationService implements CheckCollocation {
  #store: CollocationCheckStore;
  constructor(store: CollocationCheckStore) {
    this.#store = store;
  }

  async check(q: string): Promise<CollocationCheck> {
    const split = splitPhrase(q);
    if (split === null) return NOT_PARSED;

    const roles = await this.#roles(split.words);
    if (roles === null) return NOT_PARSED;
    const { nounToken, verbToken, verbCandidates } = roles;

    // Phones type "entscheidung": the page is under the capitalised form.
    const nounForm = capitalise(nounToken);
    const headword = await this.#store.resolveHeadword(nounForm);
    if (headword === null || pageSide(headword.pos) !== "noun") return NOT_PARSED;

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

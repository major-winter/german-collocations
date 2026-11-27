import type { CheckPhrase, CheckVerdict, CollocationCheck, VerbNounPair } from '@collocations/types';

// Decisions #70, #74, #76, #77: "Passt das zusammen?" - the pure parts of the
// check card and of the search box's phrase routing. Since #77 the header
// search box is the only field: it looks words up and checks phrases.

type Parsed = Extract<CollocationCheck, { parsed: true }>;
export type PartnerKind = 'verb' | 'adjective';

/** The word class of the checked partner: a verb (#70) or an adjective (#74). */
export function partnerKind(check: Parsed): PartnerKind {
    return check.relation === 'amod' ? 'adjective' : 'verb';
}

/** The partner token as the learner typed it ("macht", "schwerer"). */
export function partnerTyped(check: Parsed): string {
    return check.relation === 'amod' ? check.adjectiveTyped : check.verbTyped;
}

/**
 * Why an unusual check is unusual, for the card's wording: the verb takes
 * another preposition with this noun (#76), the verb is not typical, or
 * the adjective is not.
 */
export function unusualReason(check: Parsed): 'preposition' | 'verb' | 'adjective' {
    if (check.relation === 'amod') return 'adjective';
    return check.relation === 'obl' && check.otherPreposition ? 'preposition' : 'verb';
}

/** Two or more words: worth asking the check before a plain search. */
export function isPhraseQuery(q: string): boolean {
    return q.trim().split(/\s+/).length >= 2;
}

export type SearchRoute = { kind: 'check' | 'search'; to: string } | { kind: 'hint' };

// #78: from three words on, an unparsed phrase is a sentence we could not
// read, not a multiword headword: "Keine Ergebnisse" would mislead.
const HINT_MIN_WORDS = 3;

/**
 * Where the header search box takes a query, given what /api/check said
 * (null: not asked, or the request failed). A parsed phrase opens its noun
 * page with the check (#70); an unparsed one of three or more words shows
 * the "can't check" hint in place (#78); anything else, including a
 * two-word fallback ("seit langem"), is a plain search.
 */
export function searchRoute(q: string, check: CollocationCheck | null): SearchRoute {
    const query = q.trim();
    const target = check && checkTarget(check);
    if (target) return { kind: 'check', to: target };
    if (check && !check.parsed && query.split(/\s+/).length >= HINT_MIN_WORDS) return { kind: 'hint' };
    return { kind: 'search', to: `/wort/${encodeURIComponent(query)}` };
}

const words = (s: string) => s.trim().split(/\s+/).join(' ');

/**
 * Whether the header shows the "can't check" hint (#78): while the field
 * still holds the phrase the server could not read, and not when the card
 * already shows it for the same phrase in `?pruefen=`.
 */
export function showsSearchHint(hintFor: string | null, value: string, pruefen: string | null): boolean {
    if (hintFor === null || words(value) !== words(hintFor)) return false;
    return pruefen === null || words(pruefen) !== words(hintFor);
}

/**
 * What the header search box shows (#77): the check in the URL, so the
 * learner corrects it in place, else the page's word.
 */
export function searchFieldValue(word: string, pruefen: string | null): string {
    const phrase = (pruefen ?? '').trim().split(/\s+/).filter((t) => t !== '').join(' ');
    if (phrase !== '') return phrase;
    try {
        return decodeURIComponent(word);
    } catch {
        return word;
    }
}

/**
 * The check the search box already fetched and passed in the navigation
 * state (#77), when it is for this query and this page; saves the card a
 * second request.
 */
export function preloadedCheck(state: unknown, query: string | null, word: string, lemma: string): Parsed | null {
    if (typeof state !== 'object' || state === null || !('check' in state)) return null;
    const check = (state as { check: CollocationCheck }).check;
    if (!check?.parsed || check.phrase !== query || !checkMatchesPage(check, word, lemma)) return null;
    return check;
}

/**
 * The browser's history entry without the passed check (#77). The browser
 * keeps `history.state` across a reload; without this, a reload would show
 * the stored verdict instead of asking the server again.
 */
export function historyStateWithoutCheck(state: unknown): Record<string, unknown> {
    const rest = typeof state === 'object' && state !== null ? state : {};
    return { ...rest, usr: null };
}

/** The phrase the card's hint offers to check (#77): the best object pair, else the best prepositional one. */
export function checkHintExample(pairs: Pick<VerbNounPair, 'relation' | 'phrase'>[]): string | null {
    return (pairs.find((p) => p.relation === 'obj') ?? pairs.find((p) => p.relation === 'obl'))?.phrase ?? null;
}

/** Where a parsed phrase takes the learner: its noun page, with the check in the URL. */
export function checkTarget(check: CollocationCheck): string | null {
    if (!check.parsed) return null;
    return `/wort/${encodeURIComponent(check.noun)}?pruefen=${encodeURIComponent(check.phrase)}`;
}

/** A check only shows on its own noun's page (a hand-edited URL may disagree). */
export function checkMatchesPage(check: CollocationCheck, word: string, lemma: string): boolean {
    return check.parsed && (check.noun === word || check.noun === lemma);
}

const LABELS: Record<CheckVerdict, string> = {
    usual: 'Üblich ✓',
    unusual: 'Nicht typisch',
    noData: 'Keine Daten',
};

export function verdictLabel(verdict: CheckVerdict): string {
    return LABELS[verdict];
}

export interface PhrasePart {
    text: string;
    kind: 'noun' | PartnerKind | 'plain';
}

/** The phrase split so the noun and its partner can carry their word-class colour (#63). */
export function phraseParts(p: CheckPhrase, partner: PartnerKind): PhrasePart[] {
    const parts: PhrasePart[] = [];
    for (const text of p.phrase.split(/(\s+)/)) {
        if (text === '') continue;
        const kind = text === p.nounWord ? 'noun' : text === p.partnerWord ? partner : 'plain';
        const last = parts.at(-1);
        if (kind === 'plain' && last?.kind === 'plain') last.text += text;
        else parts.push({ text, kind });
    }
    return parts;
}

import type { CheckPhrase, CheckVerdict, CollocationCheck } from '@collocations/types';

// Decisions #70, #74: "Passt das zusammen?" - the pure parts of the check
// card and of the search box's phrase routing.

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

/** Two or more words: worth asking the check before a plain search. */
export function isPhraseQuery(q: string): boolean {
    return q.trim().split(/\s+/).length >= 2;
}

/**
 * What the card's field sends to the check (#75): a whole phrase as typed,
 * exactly like the search box; a single word goes with the page's noun.
 * Null when the field is empty.
 */
export function checkQueryFor(input: string, word: string): string | null {
    const typed = input.trim().split(/\s+/).filter((t) => t !== '').join(' ');
    if (typed === '') return null;
    return isPhraseQuery(typed) ? typed : `${word} ${typed}`;
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

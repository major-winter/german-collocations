import type { CheckPhrase, CheckVerdict, CollocationCheck } from '@collocations/types';

// Decision #70: "Passt das zusammen?" - the pure parts of the check card
// and of the search box's phrase routing.

/** Two or more words: worth asking the check before a plain search. */
export function isPhraseQuery(q: string): boolean {
    return q.trim().split(/\s+/).length >= 2;
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
    kind: 'noun' | 'verb' | 'plain';
}

/** The phrase split so the noun and verb words can carry their word-class colour (#63). */
export function phraseParts(p: CheckPhrase): PhrasePart[] {
    const parts: PhrasePart[] = [];
    for (const text of p.phrase.split(/(\s+)/)) {
        if (text === '') continue;
        const kind = text === p.nounWord ? 'noun' : text === p.verbWord ? 'verb' : 'plain';
        const last = parts.at(-1);
        if (kind === 'plain' && last?.kind === 'plain') last.text += text;
        else parts.push({ text, kind });
    }
    return parts;
}

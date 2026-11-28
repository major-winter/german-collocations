import type { CollocationSection, LemmaSuggestion, WordClass } from '@collocations/types';
import { isPhraseQuery } from './collocationCheck.ts';
import { wordClassStyle } from './wordClass.ts';

// Decision #88: as-you-type suggestions in the header field. Everything here
// runs without a browser: what is asked, what a row shows, how the arrow keys
// move, what a screen reader hears.

const MIN_CHARS = 2; // the backend returns [] below this (#85)
export const SUGGEST_DELAY_MS = 140;

/**
 * What to ask /api/suggest for, or null when nothing should be asked: under
 * two characters, or a phrase (Enter sends those to the check, #77).
 */
export function suggestionQuery(raw: string): string | null {
    const q = raw.trim();
    if (q.length < MIN_CHARS || isPhraseQuery(q)) return null;
    return q;
}

export interface SuggestionRow {
    id: string;               // the option's DOM id, for aria-activedescendant
    lemma: string;
    article: 'der' | 'die' | 'das' | null; // shown muted before the lemma; never guessed
    head: string;             // the part the learner has typed (shown bold), '' if the lemma does not start with it
    tail: string;
    classLabel: string | null; // singular German name; null for "other"
    dot: string | null;        // the app's class dot colour; null for classes without one
    to: string;
}

// The server's word classes onto the app's five sections (GLOSSARY.md):
// adverbs and names have no colour of their own.
const SECTION: Record<WordClass, CollocationSection> = {
    noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'other', name: 'other', other: 'other',
};
const LABEL: Record<WordClass, string | null> = {
    noun: 'Substantiv', verb: 'Verb', adjective: 'Adjektiv', adverb: 'Adverb', name: 'Name', other: null,
};

export const OPTION_ID_PREFIX = 'suggestion-';

export function suggestionRows(suggestions: LemmaSuggestion[], query: string): SuggestionRow[] {
    const typed = query.trim().toLowerCase();
    return suggestions.map((s, i) => {
        const marked = typed !== '' && s.lemma.toLowerCase().startsWith(typed) ? typed.length : 0;
        return {
            id: `${OPTION_ID_PREFIX}${i}`,
            lemma: s.lemma,
            article: s.article,
            head: s.lemma.slice(0, marked),
            tail: s.lemma.slice(marked),
            classLabel: LABEL[s.wordClass],
            dot: wordClassStyle(SECTION[s.wordClass]).dot,
            to: `/wort/${encodeURIComponent(s.lemma)}`,
        };
    });
}

/**
 * The active row after an arrow key; -1 is "none": Enter then submits the
 * typed text. Both ends pass through "none", so the learner can get back.
 */
export function moveActive(current: number, key: 'ArrowDown' | 'ArrowUp', count: number): number {
    if (count === 0) return -1;
    const next = current + (key === 'ArrowDown' ? 1 : -1);
    if (next >= count) return -1;
    if (next < -1) return count - 1;
    return next;
}

/** The polite live message when the list changes. */
export function suggestionAnnouncement(count: number): string {
    if (count === 0) return 'Keine Vorschläge';
    return `${count} ${count === 1 ? 'Vorschlag' : 'Vorschläge'}. Mit den Pfeiltasten wählen.`;
}

interface SuggesterOptions {
    load: (query: string, signal: AbortSignal) => Promise<LemmaSuggestion[]>;
    onRows: (rows: SuggestionRow[], query: string) => void;
    delayMs?: number;
}

/**
 * Debounce and abort for the field. `input` is called on every keystroke;
 * `cancel` when the learner submits, picks a row or leaves the field. A
 * failed request reads as "no suggestions": the field keeps working.
 */
export function createSuggester({ load, onRows, delayMs = SUGGEST_DELAY_MS }: SuggesterOptions) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    function cancel() {
        clearTimeout(timer);
        timer = undefined;
        controller?.abort();
        controller = undefined;
    }

    function input(raw: string) {
        cancel();
        const query = suggestionQuery(raw);
        if (query === null) {
            onRows([], '');
            return;
        }
        timer = setTimeout(async () => {
            const mine = new AbortController();
            controller = mine;
            try {
                const found = await load(query, mine.signal);
                if (!mine.signal.aborted) onRows(suggestionRows(found, query), query);
            } catch {
                if (!mine.signal.aborted) onRows([], ''); // silent: no "Keine Vorschläge" for a failure
            }
        }, delayMs);
    }

    return { input, cancel };
}

import type { CollocationResponse, CollocationSection } from '@collocations/types';

// Word classes (GLOSSARY.md): the one place that knows their order, German
// label and colours. Decision #63 sets which colours; decision #66 is why
// they live here. Class names stay written out in full: Tailwind only
// generates classes it finds literally in the source.

export const WORD_CLASS_ORDER: CollocationSection[] = ['noun', 'verb', 'adjective', 'preposition', 'other'];

export interface WordClassStyle {
    label: string;       // German heading and legend label
    text: string;        // text colour for the word inside phrases and sentences
    dot: string | null;  // legend dot; null for a class with no colour of its own
}

const STYLES: Record<CollocationSection, WordClassStyle> = {
    noun: { label: 'Substantive', text: 'text-pos-noun', dot: 'bg-pos-noun' },
    verb: { label: 'Verben', text: 'text-pos-verb', dot: 'bg-pos-verb' },
    adjective: { label: 'Adjektive', text: 'text-pos-adjective', dot: 'bg-pos-adjective' },
    preposition: { label: 'Präpositionen', text: 'text-pos-preposition', dot: 'bg-pos-preposition' },
    other: { label: 'Sonstige', text: 'text-foreground', dot: null },
};

export function wordClassStyle(wordClass: CollocationSection): WordClassStyle {
    return STYLES[wordClass];
}

/**
 * The word classes whose colours appear on a word page: those of the
 * collocation list, plus noun and verb whenever there are lab pairs, since
 * every lab phrase colours one of each.
 */
export function legendSections(response: CollocationResponse): Set<CollocationSection> {
    const sections = new Set<CollocationSection>(response.collocations.map((entry) => entry.section));
    if (response.verbNounPairs?.pairs.length) {
        sections.add('noun');
        sections.add('verb');
    }
    return sections;
}

/**
 * Decision #86: a verb-noun group is coloured by its chips, the partners:
 * verbs when a noun was searched, nouns when a verb was.
 */
export function partnerSection(side: 'noun' | 'verb'): CollocationSection {
  return side === 'noun' ? 'verb' : 'noun';
}

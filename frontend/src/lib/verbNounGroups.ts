import type {
    CollocationResponse,
    VerbNounPair,
    VerbNounPairs,
    VerbNounRelation,
} from '@collocations/types';

// Decision #60: the lab's verb-noun pairs are shown in three groups,
// in this order, each ranked on its own (layout "C").
export const RELATION_ORDER: VerbNounRelation[] = ['obj', 'obl', 'nsubj'];

export interface VerbNounGroup {
    relation: VerbNounRelation;
    pairs: VerbNounPair[];
}

export function groupHeadings(
    side: VerbNounPairs['side'],
    lemma: string,
): Record<VerbNounRelation, string> {
    return side === 'noun'
        ? {
              obj: `${lemma} + Verb`,
              obl: `Präposition + ${lemma} + Verb`,
              nsubj: `${lemma} als Subjekt`,
          }
        : {
              obj: `Substantiv + ${lemma}`,
              obl: `Präposition + Substantiv + ${lemma}`,
              nsubj: 'Substantiv als Subjekt',
          };
}

/** The pairs split by relation, in RELATION_ORDER; empty groups are left out. */
export function groupPairs(pairs: VerbNounPair[]): VerbNounGroup[] {
    return RELATION_ORDER.map((relation) => ({
        relation,
        pairs: pairs.filter((pair) => pair.relation === relation),
    })).filter((group) => group.pairs.length > 0);
}

/** Which chip is open per group when the page loads: the first chip of the first group. */
export function initialOpen(groups: VerbNounGroup[]): Record<VerbNounRelation, number | null> {
    const open: Record<VerbNounRelation, number | null> = { obj: null, obl: null, nsubj: null };
    if (groups.length > 0) open[groups[0].relation] = 0;
    return open;
}

export function hasAnyResults(response: CollocationResponse): boolean {
    return response.collocations.length > 0 || (response.verbNounPairs?.pairs.length ?? 0) > 0;
}

export interface WordColors {
    searched: string; // the looked-up word in phrases and sentences
    partner: string;  // the other side of the pair
    chip: string;     // chip text
}

/** Nouns are blue and verbs orange (the pos-noun/pos-verb section colours), whichever side was searched. */
export function wordColors(side: VerbNounPairs['side']): WordColors {
    return side === 'noun'
        ? { searched: 'font-semibold text-pos-noun', partner: 'text-pos-verb', chip: '' }
        : { searched: 'font-semibold', partner: 'text-pos-noun', chip: 'text-pos-noun' };
}

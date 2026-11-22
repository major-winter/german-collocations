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

export interface HeadingPart {
    text: string;
    noun: boolean; // the noun part takes the noun colour, the rest stays grey
}

export function headingParts(
    side: VerbNounPairs['side'],
    lemma: string,
): Record<VerbNounRelation, HeadingPart[]> {
    const noun = (text: string): HeadingPart => ({ text, noun: true });
    const other = (text: string): HeadingPart => ({ text, noun: false });
    return side === 'noun'
        ? {
              obj: [noun(lemma), other(' + Verb')],
              obl: [other('Präposition + '), noun(lemma), other(' + Verb')],
              nsubj: [noun(lemma), other(' als Subjekt')],
          }
        : {
              obj: [noun('Substantiv'), other(` + ${lemma}`)],
              obl: [other('Präposition + '), noun('Substantiv'), other(` + ${lemma}`)],
              nsubj: [noun('Substantiv'), other(' als Subjekt')],
          };
}

export function groupHeadings(
    side: VerbNounPairs['side'],
    lemma: string,
): Record<VerbNounRelation, string> {
    const parts = headingParts(side, lemma);
    return {
        obj: parts.obj.map((part) => part.text).join(''),
        obl: parts.obl.map((part) => part.text).join(''),
        nsubj: parts.nsubj.map((part) => part.text).join(''),
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

/** Clicking a chip opens it; clicking the open chip again keeps it open. */
export function openAfterClick(
    open: Record<VerbNounRelation, number | null>,
    relation: VerbNounRelation,
    chipIndex: number,
): Record<VerbNounRelation, number | null> {
    return { ...open, [relation]: chipIndex };
}

export function hasAnyResults(response: CollocationResponse): boolean {
    return response.collocations.length > 0 || (response.verbNounPairs?.pairs.length ?? 0) > 0;
}

import type { CollocationResponse, CollocationSection, VerbNounRelation } from '@collocations/types';
import { groupPairs } from './verbNounGroups.ts';
import { partnerSection, WORD_CLASS_ORDER, wordClassStyle } from './wordClass.ts';

// Sprungleiste: one entry per group card the word page actually renders, in
// the order it renders them (verb-noun groups, then word-class sections), so
// the strip never lists a group that is not there.

export interface JumpGroup {
    id: string;           // the card's DOM id, the scroll target
    label: string;        // short name on the pill
    pos: CollocationSection; // the card's colour class
    count: number;        // chips in the group
}

export const verbNounGroupId = (relation: VerbNounRelation) => `group-${relation}`;
export const sectionGroupId = (section: CollocationSection) => `group-${section}`;

/** The id of a group's heading, which takes focus after a jump. */
export const headingId = (groupId: string) => `${groupId}-heading`;

export function jumpGroups(response: CollocationResponse): JumpGroup[] {
    const groups: JumpGroup[] = [];
    const pairs = response.verbNounPairs;
    if (pairs) {
        const pos = partnerSection(pairs.side);
        const labels: Record<VerbNounRelation, string> = {
            obj: wordClassStyle(pos).label,
            obl: 'mit Präposition',
            nsubj: 'als Subjekt',
        };
        for (const group of groupPairs(pairs.pairs)) {
            groups.push({ id: verbNounGroupId(group.relation), label: labels[group.relation], pos, count: group.pairs.length });
        }
    }
    for (const section of WORD_CLASS_ORDER) {
        const count = response.collocations.filter((entry) => entry.section === section).length;
        if (count > 0) {
            groups.push({ id: sectionGroupId(section), label: wordClassStyle(section).label, pos: section, count });
        }
    }
    return groups;
}

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { highlightCollocates } from '@/lib/highlight.tsx';
import { groupHeadings, groupPairs, initialOpen, wordColors, type WordColors } from '@/lib/verbNounGroups.ts';
import type { VerbNounPair, VerbNounPairs as VerbNounPairsData, VerbNounRelation } from '@collocations/types';

interface VerbNounPairsProps {
    data: VerbNounPairsData;
}

// The last word of a lemma ("sich richten" -> "richten"), the one that
// appears as its own token in a phrase like "Kritik … sich richten".
function lastWord(lemma: string): string {
    return lemma.split(' ').at(-1) ?? lemma;
}

function OpenPair({ pair, side, lemma, colors }: {
    pair: VerbNounPair;
    side: VerbNounPairsData['side'];
    lemma: string;
    colors: WordColors;
}) {
    const searchedWord = side === 'noun' ? lemma : lastWord(lemma);
    const partnerWord = side === 'noun' ? lastWord(pair.partner) : pair.partner;

    return (
        <div className="rounded-lg px-2 py-1.5 space-y-1">
            <p className="text-base">
                {highlightCollocates(pair.phrase, searchedWord, partnerWord, colors.partner, colors.searched)}
            </p>
            {pair.examples.map((example, exampleIndex) => (
                <p key={exampleIndex} className="text-base text-muted-foreground italic">
                    {highlightCollocates(
                        example.sentence,
                        example.searchWord,
                        example.collocateWord,
                        colors.partner,
                        colors.searched,
                    )}
                </p>
            ))}
        </div>
    );
}

/**
 * Decision #60: the lab's verb-noun pairs as layout "C" - per group a
 * row of chips ranked by LL score; tapping a chip opens its phrase and
 * example sentences below the row, one open chip per group.
 */
export function VerbNounPairs({ data }: VerbNounPairsProps) {
    const groups = groupPairs(data.pairs);
    const [openChip, setOpenChip] = useState(() => initialOpen(groups));

    if (groups.length === 0) return null;

    const headings = groupHeadings(data.side, data.lemma);
    const colors = wordColors(data.side);

    function toggle(relation: VerbNounRelation, chipIndex: number) {
        setOpenChip((current) => ({
            ...current,
            [relation]: current[relation] === chipIndex ? null : chipIndex,
        }));
    }

    return (
        <section className="mb-6 flex flex-col gap-4">
            {groups.map(({ relation, pairs }) => {
                const openIndex = openChip[relation];
                return (
                    <div key={relation} className="py-3">
                        <h3 className={cn('text-sm font-medium uppercase tracking-wide mb-1.5', colors.partner)}>
                            {headings[relation]}
                        </h3>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {pairs.map((pair, chipIndex) => (
                                <button
                                    key={pair.phrase}
                                    type="button"
                                    aria-pressed={openIndex === chipIndex}
                                    onClick={() => toggle(relation, chipIndex)}
                                    className={cn(
                                        'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent/50',
                                        openIndex === chipIndex && 'bg-accent text-accent-foreground',
                                        colors.chip,
                                    )}
                                >
                                    {pair.chip}
                                </button>
                            ))}
                        </div>
                        {openIndex !== null && pairs[openIndex] && (
                            <OpenPair
                                pair={pairs[openIndex]}
                                side={data.side}
                                lemma={data.lemma}
                                colors={colors}
                            />
                        )}
                    </div>
                );
            })}
        </section>
    );
}

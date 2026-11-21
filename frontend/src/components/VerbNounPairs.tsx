import { useState } from 'react';
import { cn } from '@/lib/utils';
import { highlightCollocates } from '@/lib/highlight.tsx';
import { groupPairs, headingParts, initialOpen, openAfterClick, wordColors, type WordColors } from '@/lib/verbNounGroups.ts';
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
            <p className="font-serif text-xl">
                {highlightCollocates(pair.phrase, searchedWord, partnerWord, colors.partner, colors.searched)}
            </p>
            {pair.examples.map((example, exampleIndex) => (
                <p key={exampleIndex} className="text-base text-muted-foreground italic border-l-2 pl-3">
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
 * example sentences below the row, one open chip per group; tapping
 * the open chip again keeps it open.
 */
export function VerbNounPairs({ data }: VerbNounPairsProps) {
    const groups = groupPairs(data.pairs);
    const [openChip, setOpenChip] = useState(() => initialOpen(groups));

    if (groups.length === 0) return null;

    const headings = headingParts(data.side, data.lemma);
    const colors = wordColors(data.side);

    function open(relation: VerbNounRelation, chipIndex: number) {
        setOpenChip((current) => openAfterClick(current, relation, chipIndex));
    }

    return (
        <section className="mb-6 flex flex-col gap-4">
            {groups.map(({ relation, pairs }) => {
                const openIndex = openChip[relation];
                return (
                    <div key={relation} className="py-3">
                        <h3 className="text-[0.95rem] font-medium mb-1.5 text-muted-foreground">
                            {headings[relation].map((part) => (
                                <span key={part.text} className={cn(part.noun && 'font-semibold text-pos-noun')}>
                                    {part.text}
                                </span>
                            ))}
                        </h3>
                        <div className="flex flex-wrap gap-2 md:gap-1.5 mb-1.5">
                            {pairs.map((pair, chipIndex) => (
                                <button
                                    key={pair.phrase}
                                    type="button"
                                    aria-pressed={openIndex === chipIndex}
                                    onClick={() => open(relation, chipIndex)}
                                    className={cn(
                                        'inline-flex min-h-11 md:min-h-8 items-center rounded-full border px-4 md:px-3 py-1 text-sm transition-colors hover:bg-accent/50',
                                        openIndex === chipIndex && 'border-foreground bg-foreground text-background hover:bg-foreground',
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

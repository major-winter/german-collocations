import { useState } from 'react';
import { cn } from '@/lib/utils';
import { chipParts } from '@/lib/chipParts.ts';
import { highlightCollocates } from '@/lib/highlight.tsx';
import { groupPairs, headingParts, initialOpen, openAfterClick } from '@/lib/verbNounGroups.ts';
import { wordClassStyle } from '@/lib/wordClass.ts';
import { PartnerChips } from './PartnerChips.tsx';
import type { VerbNounPair, VerbNounPairs as VerbNounPairsData, VerbNounRelation } from '@collocations/types';

interface VerbNounPairsProps {
    data: VerbNounPairsData;
}

// The last word of a lemma ("sich richten" -> "richten"), the one that
// appears as its own token in a phrase like "Kritik … sich richten".
function lastWord(lemma: string): string {
    return lemma.split(' ').at(-1) ?? lemma;
}

interface WordColors {
    searched: string; // the looked-up word in phrases and sentences: bold, in its word class colour
    partner: string;  // the other side of the pair, in its word class colour
}

// Nouns take the noun colour and verbs the verb colour, whichever side was searched.
function wordColors(side: VerbNounPairsData['side']): WordColors {
    const partnerSide = side === 'noun' ? 'verb' : 'noun';
    return {
        searched: cn('font-semibold', wordClassStyle(side).text),
        partner: wordClassStyle(partnerSide).text,
    };
}

function OpenPair({ pair, side, lemma, colors }: {
    pair: VerbNounPair;
    side: VerbNounPairsData['side'];
    lemma: string;
    colors: WordColors;
}) {
    // Decision #69: the phrase writes the noun as the corpus does ("Entscheidungen"), not as its lemma.
    const searchedWord = side === 'noun' ? pair.phraseNoun : lastWord(lemma);
    const partnerWord = side === 'noun' ? lastWord(pair.partner) : pair.phraseNoun;

    return (
        <div className="rounded-lg py-1.5 space-y-1">
            <p className="type-phrase">
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
                        <h3 className="type-heading mb-2">
                            {headings[relation].map((part) => (
                                <span key={part.text} className={cn(part.noun && cn('font-semibold', wordClassStyle('noun').text))}>
                                    {part.text}
                                </span>
                            ))}
                        </h3>
                        <PartnerChips
                            chips={pairs.map((pair, chipIndex) => ({
                                key: pair.phrase,
                                label: chipParts(pair.chip, pair.chipArticle).map((part, partIndex) => (
                                    <span
                                        key={partIndex}
                                        className={cn(part.muted && (openIndex === chipIndex ? 'opacity-70' : 'text-muted-foreground'))}
                                    >
                                        {part.text}
                                    </span>
                                )),
                            }))}
                            openIndex={openIndex}
                            onOpen={(chipIndex) => open(relation, chipIndex)}
                        >
                            {openIndex !== null && pairs[openIndex] && (
                                <OpenPair pair={pairs[openIndex]} side={data.side} lemma={data.lemma} colors={colors} />
                            )}
                        </PartnerChips>
                    </div>
                );
            })}
        </section>
    );
}

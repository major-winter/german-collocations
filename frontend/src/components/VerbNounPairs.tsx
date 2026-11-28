import { useState } from 'react';
import { cn } from '@/lib/utils';
import { chipParts } from '@/lib/chipParts.ts';
import { highlightCollocates } from '@/lib/highlight.tsx';
import { headingId, verbNounGroupId } from '@/lib/jumpGroups.ts';
import { groupPairs, headingParts, initialOpen, openAfterClick } from '@/lib/verbNounGroups.ts';
import { partnerSection, wordClassStyle } from '@/lib/wordClass.ts';
import { PartnerChips } from './PartnerChips.tsx';
import { ReadingPanel } from './ReadingPanel.tsx';
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
        <ReadingPanel>
            <p className="type-reading-phrase">
                {highlightCollocates(pair.phrase, searchedWord, partnerWord, colors.partner, colors.searched)}
            </p>
            {pair.examples.map((example, exampleIndex) => (
                <p key={exampleIndex} className="type-example">
                    {highlightCollocates(
                        example.sentence,
                        example.searchWord,
                        example.collocateWord,
                        cn(colors.partner, 'font-semibold'),
                        colors.searched,
                    )}
                </p>
            ))}
        </ReadingPanel>
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
                    <div key={relation} id={verbNounGroupId(relation)} data-pos={partnerSection(data.side)} className="pos-card">
                        <h3 id={headingId(verbNounGroupId(relation))} tabIndex={-1} className="pos-card-heading">
                            {headings[relation].map((part) => (
                                <span key={part.text}>{part.text}</span>
                            ))}
                        </h3>
                        <PartnerChips
                            chips={pairs.map((pair, chipIndex) => ({
                                key: pair.phrase,
                                label: chipParts(pair.chip, pair.chipArticle).map((part, partIndex) => (
                                    <span
                                        key={partIndex}
                                        className={cn(part.muted && openIndex !== chipIndex && 'text-muted-foreground')}
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

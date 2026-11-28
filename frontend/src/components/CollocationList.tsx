import { useState } from 'react';
import { PartnerChips } from './PartnerChips.tsx';
import { ReadingPanel } from './ReadingPanel.tsx';
import { initialOpenGroups, openGroupChip } from '@/lib/partnerChips.ts';
import { StatusMessage } from './StatusMessage.tsx';
import { highlightCollocates } from '@/lib/highlight.tsx';
import { WORD_CLASS_ORDER, wordClassStyle } from '@/lib/wordClass.ts';
import type { CollocationEntry, CollocationSection } from '@collocations/types';

interface CollocationListProps {
    word: string;
    entries: CollocationEntry[];
    // False when another part of the page (VerbNounPairs) has results.
    showEmptyMessage: boolean;
    // #83: open the first group's first chip, when no verb pair is open above.
    openFirst: boolean;
}

function OpenEntry({ word, entry, section }: { word: string; entry: CollocationEntry; section: CollocationSection }) {
    const partnerColor = wordClassStyle(section).text;
    if (entry.examples.length === 0) {
        // No example sentence: the bare pair, so the chip still opens to something.
        return (
            <ReadingPanel>
                <p className="type-reading-phrase">
                    <span className="font-semibold">{word}</span> <span className={partnerColor}>{entry.word}</span>
                </p>
                <p className="text-sm text-muted-foreground">Noch keine Beispielsätze.</p>
            </ReadingPanel>
        );
    }
    return (
        <ReadingPanel>
            {entry.examples.map((example, i) => (
                <p key={i} className="type-example">
                    {highlightCollocates(example.sentence, example.searchWord, example.collocateWord, `${partnerColor} font-semibold`)}
                </p>
            ))}
        </ReadingPanel>
    );
}

function groupBySection(entries: CollocationEntry[]): Map<CollocationSection, CollocationEntry[]> {
    const groups = new Map<CollocationSection, CollocationEntry[]>();
    for (const entry of entries) {
        const group = groups.get(entry.section);
        if (group) {
            group.push(entry);
        } else {
            groups.set(entry.section, [entry]);
        }
    }
    return groups;
}

export function CollocationList({ word, entries, showEmptyMessage, openFirst }: CollocationListProps) {
    const groups = groupBySection(entries);
    const sections = WORD_CLASS_ORDER.filter((section) => groups.has(section));
    const [openChip, setOpenChip] = useState(() => initialOpenGroups(sections, openFirst));

    return (
        <section className="mb-6">
            {entries.length === 0 ? (
                showEmptyMessage && (
                    <StatusMessage className="mt-4">
                        Zu <i>{word}</i> haben wir in unseren Texten noch keine Verbindungen gefunden.
                    </StatusMessage>
                )
            ) : (
                <div className="flex flex-col gap-4">
                    {sections.map((section) => {
                        const group = groups.get(section)!;
                        const openIndex = openChip[section] ?? null;
                        return (
                            <div key={section} data-pos={section} className="pos-card">
                                <h3 className="pos-card-heading">{wordClassStyle(section).label}</h3>
                                <PartnerChips
                                    chips={group.map((entry, i) => ({ key: `${entry.word}-${i}`, label: entry.word }))}
                                    openIndex={openIndex}
                                    onOpen={(chipIndex) => setOpenChip((current) => openGroupChip(current, section, chipIndex))}
                                >
                                    {openIndex !== null && group[openIndex] && (
                                        <OpenEntry word={word} entry={group[openIndex]} section={section} />
                                    )}
                                </PartnerChips>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

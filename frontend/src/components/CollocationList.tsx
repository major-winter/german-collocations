import { cn } from '@/lib/utils';
import { highlightCollocates } from '@/lib/highlight.tsx';
import { WORD_CLASS_ORDER, wordClassStyle } from '@/lib/wordClass.ts';
import type { CollocationEntry, CollocationSection } from '@collocations/types';

interface CollocationListProps {
    word: string;
    entries: CollocationEntry[];
    // False when another part of the page (VerbNounPairs) has results.
    showEmptyMessage: boolean;
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

export function CollocationList({ word, entries, showEmptyMessage }: CollocationListProps) {
    const groups = groupBySection(entries);

    return (
        <section className="mb-6">
            {entries.length === 0 ? (
                showEmptyMessage && <p className="text-sm text-muted-foreground text-center">Keine Ergebnisse.</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {WORD_CLASS_ORDER.filter((section) => groups.has(section)).map((section) => (
                        <div key={section} className="py-3">
                            <h3 className="text-base font-medium mb-2 text-muted-foreground">
                                {wordClassStyle(section).label}
                            </h3>
                            <ul className="flex flex-col gap-4 list-none p-0">
                                {groups
                                    .get(section)!
                                    .map((entry, i) => (
                                        <li key={`${entry.word}-${i}`} className="px-2 space-y-1">
                                            {entry.examples.length > 0 ? (
                                                <>
                                                    {/* The partner's lemma, so the list can be scanned without reading every sentence. */}
                                                    <p className="font-serif text-lg">{entry.word}</p>
                                                    {entry.examples.map((example, i) => (
                                                        <p key={i} className="text-base text-muted-foreground italic border-l-2 pl-3">
                                                            {highlightCollocates(
                                                                example.sentence,
                                                                example.searchWord,
                                                                example.collocateWord,
                                                                wordClassStyle(section).text,
                                                            )}
                                                        </p>
                                                    ))}
                                                </>
                                            ) : (
                                                <p className="text-base text-muted-foreground">
                                                    <span className="font-semibold not-italic">{word}</span>{' '}
                                                    <span className={cn('not-italic', wordClassStyle(section).text)}>
                                                        {entry.word}
                                                    </span>
                                                </p>
                                            )}
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

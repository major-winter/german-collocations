import { cn } from '@/lib/utils';
import { highlightCollocates } from '@/lib/highlight.tsx';
import type { CollocationEntry, CollocationSection } from '@collocations/types';

interface CollocationListProps {
    word: string;
    entries: CollocationEntry[];
    // False when another part of the page (VerbNounPairs) has results.
    showEmptyMessage: boolean;
}

const SECTION_ORDER: CollocationSection[] = ['noun', 'verb', 'adjective', 'preposition', 'other'];

const SECTION_LABELS: Record<CollocationSection, string> = {
    noun: 'Substantive',
    verb: 'Verben',
    adjective: 'Adjektive',
    preposition: 'Präpositionen',
    other: 'Sonstige',
};

const PAINT_COLORS: Record<CollocationSection, string> = {
    noun: 'text-pos-noun',
    verb: 'text-pos-verb',
    adjective: 'text-pos-adjective',
    preposition: 'text-pos-preposition',
    other: 'text-foreground',
};

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
                    {SECTION_ORDER.filter((section) => groups.has(section)).map((section) => (
                        <div key={section} className="py-3">
                            <h3
                                className={cn(
                                    'text-sm font-medium uppercase tracking-wide mb-1.5',
                                    PAINT_COLORS[section],
                                )}
                            >
                                {SECTION_LABELS[section]}
                            </h3>
                            <div className="flex flex-col gap-1.5">
                                {groups
                                    .get(section)!
                                    .map((entry, i) => (
                                        <div
                                            key={`${entry.word}-${i}`}
                                            className="rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors space-y-1"
                                        >
                                            {entry.examples.length > 0 ? (
                                                entry.examples.map((example, i) => (
                                                    <p key={i} className="text-base text-muted-foreground italic">
                                                        {highlightCollocates(
                                                            example.sentence,
                                                            example.searchWord,
                                                            example.collocateWord,
                                                            PAINT_COLORS[section],
                                                        )}
                                                    </p>
                                                ))
                                            ) : (
                                                <p className="text-base text-muted-foreground">
                                                    <span className="font-semibold not-italic">{word}</span>{' '}
                                                    <span className={cn('not-italic', PAINT_COLORS[section])}>
                                                        {entry.word}
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

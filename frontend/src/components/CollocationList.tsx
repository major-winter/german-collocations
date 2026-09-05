import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CollocationEntry, CollocationSection } from '@collocations/types';

interface CollocationListProps {
    entries: CollocationEntry[];
}

// Matches against a given example's own searchWord/collocateWord - the
// literal surface-form tokens for that specific sentence, already
// disambiguated by the backend via lemma id (see CollocationRepository
// .ts's groupRows) - not against CollocationEntry.word or a page-level
// query string, since decision #44 means a sentence's actual words can
// differ from their own lemma's spelling (e.g. "Gedankens" for a
// "Gedanken" entry). \p{L}+ (rather than \w+) is needed because German
// words contain umlauts/ß, which \w excludes.
function highlightCollocates(
    sentence: string,
    searchWord: string,
    collocateWord: string,
    paintClassName: string,
): ReactNode[] {
    const boldFor = new Map([
        [searchWord.toLowerCase(), true],
        [collocateWord.toLowerCase(), false],
    ]);
    const pattern = /\p{L}+/gu;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = pattern.exec(sentence)) !== null) {
        const word = match[0];
        const wordLower = word.toLowerCase();
        const isBold = boldFor.get(wordLower);
        if (isBold !== undefined) {
            if (match.index > lastIndex) {
                nodes.push(sentence.slice(lastIndex, match.index));
            }
            nodes.push(
                <span key={key++} className={cn('not-italic', isBold && 'font-semibold', paintClassName)}>
                    {word}
                </span>,
            );
            lastIndex = match.index + word.length;
        }
    }
    if (lastIndex < sentence.length) {
        nodes.push(sentence.slice(lastIndex));
    }
    return nodes;
}

const SECTION_ORDER: CollocationSection[] = ['noun', 'verb', 'adjective', 'preposition', 'other'];

const SECTION_LABELS: Record<CollocationSection, string> = {
    noun: 'Nouns',
    verb: 'Verbs',
    adjective: 'Adjectives',
    preposition: 'Prepositions',
    other: 'Other',
};

const PAINT_COLORS: Record<CollocationSection, string> = {
    noun: 'text-blue-600 dark:text-blue-400',
    verb: 'text-orange-600 dark:text-orange-400',
    adjective: 'text-green-600 dark:text-green-400',
    preposition: 'text-purple-600 dark:text-purple-400',
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

export function CollocationList({ entries }: CollocationListProps) {
    const groups = groupBySection(entries);

    return (
        <section className="mb-6">
            {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">Keine Ergebnisse.</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {SECTION_ORDER.filter((section) => groups.has(section)).map((section) => (
                        <div key={section} className="py-3">
                            <h3
                                className={cn(
                                    'text-xs font-medium uppercase tracking-wide mb-1.5',
                                    PAINT_COLORS[section],
                                )}
                            >
                                {SECTION_LABELS[section]}
                            </h3>
                            <div className="flex flex-col gap-1.5">
                                {groups
                                    .get(section)!
                                    .filter((entry) => entry.examples.length > 0)
                                    .map((entry, i) => (
                                        <div
                                            key={`${entry.word}-${i}`}
                                            className="rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors cursor-pointer space-y-1"
                                        >
                                            {entry.examples.map((example, i) => (
                                                <p key={i} className="text-xs text-muted-foreground italic">
                                                    {highlightCollocates(
                                                        example.sentence,
                                                        example.searchWord,
                                                        example.collocateWord,
                                                        PAINT_COLORS[section],
                                                    )}
                                                </p>
                                            ))}
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

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import type { CollocationEntry, CollocationSection } from '@collocations/types';

interface CollocationListProps {
    title: string;
    direction: 'followed' | 'preceded';
    entries: CollocationEntry[];
    queryWord: string;
}

// Sentences and collocate words are the exact surface forms from the
// corpus (see CollocationRepository.ts), so matching on literal word
// tokens - not lemmas - is correct here. \p{L}+ (rather than \w+) is
// needed because German words contain umlauts/ß, which \w excludes.
function highlightCollocates(sentence: string, targets: string[]): ReactNode[] {
    const targetSet = new Set(targets.map((t) => t.toLowerCase()));
    const pattern = /\p{L}+/gu;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = pattern.exec(sentence)) !== null) {
        const word = match[0];
        if (targetSet.has(word.toLowerCase())) {
            if (match.index > lastIndex) {
                nodes.push(sentence.slice(lastIndex, match.index));
            }
            nodes.push(
                <mark key={key++} className="bg-primary/15 text-foreground font-semibold not-italic rounded-sm px-0.5">
                    {word}
                </mark>,
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

export function CollocationList({ title, direction, entries, queryWord }: CollocationListProps) {
    const Icon = direction === 'followed' ? ArrowRight : ArrowLeft;
    const groups = groupBySection(entries);

    return (
        <section className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Icon className="h-4 w-4" />
                {title}
            </h2>
            {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No results.</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {SECTION_ORDER.filter((section) => groups.has(section)).map((section) => (
                        <div key={section}>
                            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                                {SECTION_LABELS[section]}
                            </h3>
                            <div className="flex flex-col gap-1.5">
                                {groups.get(section)!.map((entry) => (
                                    <div key={entry.word}>
                                        <Card className="px-4 py-2.5 hover:bg-accent transition-colors cursor-pointer">
                                            <span className="text-sm">{entry.word}</span>
                                            {entry.examples.length > 0 && (
                                                <div className="mt-1.5 space-y-1 border-t pt-1.5">
                                                    {entry.examples.map((sentence, i) => (
                                                        <p key={i} className="text-xs text-muted-foreground italic">
                                                            {highlightCollocates(sentence, [queryWord, entry.word])}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </Card>
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

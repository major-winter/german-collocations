import { Card } from '@/components/ui/card';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import type { CollocationEntry, CollocationSection } from '@collocations/types';

interface CollocationListProps {
    title: string;
    direction: 'followed' | 'preceded';
    entries: CollocationEntry[];
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

export function CollocationList({ title, direction, entries }: CollocationListProps) {
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
                                                            {sentence}
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

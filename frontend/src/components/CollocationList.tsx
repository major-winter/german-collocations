import { Card } from '@/components/ui/card';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import type { CollocationEntry } from '@collocations/types';

interface CollocationListProps {
    title: string;
    direction: 'followed' | 'preceded';
    entries: CollocationEntry[];
}

export function CollocationList({ title, direction, entries }: CollocationListProps) {
    const Icon = direction === 'followed' ? ArrowRight : ArrowLeft;
    return (
        <section className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Icon className="h-4 w-4" />
                {title}
            </h2>
            {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No results.</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {entries.map((entry) => (
                        <div
                            key={entry.word}
                        >
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
            )}
        </section>
    );
}

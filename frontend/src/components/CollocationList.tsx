import { Link } from 'react-router';
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
                        <Link
                            key={entry.word}
                            to={`/wort/${encodeURIComponent(entry.word)}`}
                        >
                            <Card className="px-4 py-2.5 hover:bg-accent transition-colors cursor-pointer">
                                <span className="text-sm">{entry.word}</span>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </section>
    );
}

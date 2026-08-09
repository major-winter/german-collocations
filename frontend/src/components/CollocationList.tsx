import type { CollocationEntry } from '@collocations/types';

interface CollocationListProps {
    title: string;
    entries: CollocationEntry[];
}

export function CollocationList({ title, entries }: CollocationListProps) {
    return (
        <section>
            <h2>{title}</h2>
            {entries.length === 0 ? (
                <p>No results.</p>
            ) : (
                <ol>
                    {entries.map((entry) => (
                        <li key={entry.word}>
                            <span>{entry.word}</span>{' '}
                            <span>({entry.significance.toFixed(1)})</span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

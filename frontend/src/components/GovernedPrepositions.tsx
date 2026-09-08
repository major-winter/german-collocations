import type { GovernedPreposition } from '@collocations/types';
import { caseColorClass } from '../lib/grammaticalCase.ts';
import { cn } from '@/lib/utils';

interface GovernedPrepositionsProps {
    word: string;
    entries: GovernedPreposition[];
}

// Rendered separately from CollocationList, not as another section inside
// it: this is a grammatical fact (which preposition + case this verb
// requires - Rektion), not a ranked collocate list, so it's styled as a
// callout rather than another row of "Präpositionen" entries. Renders
// nothing when there's no qualifying entry (non-verbs, or a verb with no
// governed preposition that cleared the backend's share/count threshold).
export function GovernedPrepositions({ word, entries }: GovernedPrepositionsProps) {
    if (entries.length === 0) return null;

    return (
        <div className="mb-4 flex flex-wrap gap-2">
            {entries.map((entry) => (
                <span
                    key={`${entry.preposition}-${entry.case}`}
                    className="inline-flex items-center gap-1 rounded-full border border-pos-preposition/40 bg-pos-preposition/10 px-3 py-1 text-sm"
                >
                    <span>{word}</span>
                    <span className="font-semibold text-pos-preposition">{entry.preposition}</span>
                    {entry.case && (
                        <span className={cn('text-xs font-medium', caseColorClass(entry.case))}>
                            ({entry.case})
                        </span>
                    )}
                </span>
            ))}
        </div>
    );
}

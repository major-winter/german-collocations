import { SECTION_LABELS, SECTION_ORDER } from './CollocationList.tsx';
import { cn } from '@/lib/utils';
import type { CollocationSection } from '@collocations/types';

// Background twins of CollocationList's text-pos-* classes (Tailwind needs the full class name).
const DOT_COLORS: Partial<Record<CollocationSection, string>> = {
    noun: 'bg-pos-noun',
    verb: 'bg-pos-verb',
    adjective: 'bg-pos-adjective',
    preposition: 'bg-pos-preposition',
};

/**
 * Key to the word-class colours on the page. Lists only the classes that
 * actually appear. The label is plain text in the normal foreground
 * colour, so the key does not itself depend on telling the colours apart.
 */
export function PosLegend({ sections }: { sections: ReadonlySet<CollocationSection> }) {
    const shown = SECTION_ORDER.filter((section) => sections.has(section) && DOT_COLORS[section]);
    if (shown.length === 0) return null;

    return (
        <ul aria-label="Farblegende" className="mt-6 mb-4 flex flex-wrap gap-x-4 gap-y-1 list-none p-0 text-xs text-muted-foreground">
            {shown.map((section) => (
                <li key={section} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-full', DOT_COLORS[section])} />
                    {SECTION_LABELS[section]}
                </li>
            ))}
        </ul>
    );
}

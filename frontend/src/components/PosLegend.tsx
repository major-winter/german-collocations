import { cn } from '@/lib/utils';
import { WORD_CLASS_ORDER, wordClassStyle } from '@/lib/wordClass.ts';
import type { CollocationSection } from '@collocations/types';

/**
 * Key to the word-class colours on the page. Lists only the classes that
 * actually appear. The label is plain text in the normal foreground
 * colour, so the key does not itself depend on telling the colours apart.
 */
export function PosLegend({ sections }: { sections: ReadonlySet<CollocationSection> }) {
    const shown = WORD_CLASS_ORDER.filter((section) => sections.has(section) && wordClassStyle(section).dot);
    if (shown.length === 0) return null;

    return (
        <ul aria-label="Farblegende" className="mt-3 mb-4 flex flex-wrap gap-x-4 gap-y-1 list-none p-0 text-xs text-muted-foreground">
            {shown.map((section) => (
                <li key={section} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-full', wordClassStyle(section).dot)} />
                    {wordClassStyle(section).label}
                </li>
            ))}
        </ul>
    );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Decisions #60, #83: a row of partner chips, one of them open. Used by the
// verb pairs and by every other partner group, so all partners share one shape.

export interface Chip {
    key: string;
    label: ReactNode;
}

interface PartnerChipsProps {
    chips: Chip[];
    openIndex: number | null;
    onOpen: (chipIndex: number) => void;
    /** What the open chip shows below the row. */
    children?: ReactNode;
}

export function PartnerChips({ chips, openIndex, onOpen, children }: PartnerChipsProps) {
    return (
        <>
            <div className="flex flex-wrap gap-2 md:gap-1.5 mb-1.5">
                {chips.map((chip, chipIndex) => (
                    <button
                        key={chip.key}
                        type="button"
                        aria-pressed={openIndex === chipIndex}
                        onClick={() => onOpen(chipIndex)}
                        className={cn(
                            'group/chip inline-flex min-h-11 md:min-h-8 items-center rounded-full border px-4 md:px-3 py-1 text-sm transition-colors hover:bg-accent/50',
                            openIndex === chipIndex && 'border-foreground bg-foreground text-background hover:bg-foreground',
                        )}
                    >
                        {/* One inline wrapper: as direct flex items the parts would lose their spaces ("dieEntscheidung"). */}
                        <span>{chip.label}</span>
                    </button>
                ))}
            </div>
            {openIndex !== null && children}
        </>
    );
}

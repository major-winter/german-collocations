import type { ReactNode } from 'react';

// Decision #84: what an open chip shows - phrase and example sentences - is
// a reading panel: a noun-blue bar, and upright serif ink for the sentences. Decision #86: it
// sits on a plate of the page ground, so it stays legible inside a tinted card.
export function ReadingPanel({ children }: { children: ReactNode }) {
    return <div className="my-3 ml-0.5 space-y-3 rounded-r-xl border-l-4 border-pos-noun bg-background py-3 pr-3 pl-4">{children}</div>;
}

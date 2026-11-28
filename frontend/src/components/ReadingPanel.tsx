import type { ReactNode } from 'react';

// Decision #84: what an open chip shows - phrase and example sentences - is
// a reading panel: a noun-blue bar, and upright serif ink for the sentences.
export function ReadingPanel({ children }: { children: ReactNode }) {
    return <div className="my-3 ml-0.5 space-y-3 border-l-4 border-pos-noun py-0.5 pl-4">{children}</div>;
}

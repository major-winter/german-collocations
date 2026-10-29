import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Matches against a given example's own searchWord/collocateWord - the
// literal surface-form tokens for that specific sentence, already
// disambiguated by the backend via lemma id (see CollocationRepository
// .ts's groupRows) - not against CollocationEntry.word or a page-level
// query string, since decision #44 means a sentence's actual words can
// differ from their own lemma's spelling (e.g. "Gedankens" for a
// "Gedanken" entry). \p{L}+ (rather than \w+) is needed because German
// words contain umlauts/ß, which \w excludes.
export function highlightCollocates(
    sentence: string,
    searchWord: string,
    collocateWord: string,
    paintClassName: string,
): ReactNode[] {
    const boldFor = new Map([
        [searchWord.toLowerCase(), true],
        [collocateWord.toLowerCase(), false],
    ]);
    const pattern = /\p{L}+/gu;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = pattern.exec(sentence)) !== null) {
        const word = match[0];
        const wordLower = word.toLowerCase();
        const isBold = boldFor.get(wordLower);
        if (isBold !== undefined) {
            if (match.index > lastIndex) {
                nodes.push(sentence.slice(lastIndex, match.index));
            }
            nodes.push(
                <span key={key++} className={cn('not-italic', isBold ? 'font-semibold' : paintClassName)}>
                    {word}
                </span>,
            );
            lastIndex = match.index + word.length;
        }
    }
    if (lastIndex < sentence.length) {
        nodes.push(sentence.slice(lastIndex));
    }
    return nodes;
}

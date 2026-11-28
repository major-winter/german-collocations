import { useEffect } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { HOME_SAMPLE } from '@/lib/homeSample.ts';
import { wordClassStyle } from '@/lib/wordClass.ts';
import { VerbNounPairs } from '@/components/VerbNounPairs.tsx';

// Words with plenty of verb-noun pairs, checked against the live data.
// The dot in front of each says which word class it is, in the legend's colours.
const EXAMPLE_WORDS: { word: string; wordClass: 'noun' | 'verb' }[] = [
    { word: 'Rolle', wordClass: 'noun' },
    { word: 'Entscheidung', wordClass: 'noun' },
    { word: 'Kritik', wordClass: 'noun' },
    { word: 'Frage', wordClass: 'noun' },
    { word: 'Verantwortung', wordClass: 'noun' },
    { word: 'Ziel', wordClass: 'noun' },
    { word: 'treffen', wordClass: 'verb' },
    { word: 'stellen', wordClass: 'verb' },
];

export function Home() {
    useEffect(() => {
        document.title = 'Wortnetz';
    }, []);

    return (
        <div className="py-10 space-y-6">
            <div className="space-y-2 text-center">
                <h2 className="font-serif text-3xl font-semibold">Welche Wörter passen zusammen?</h2>
                <p className="text-muted-foreground">
                    Suchen Sie ein Wort, und Sie sehen seine Partner mit Beispielsätzen aus echten Texten.
                    So sieht das aus:
                </p>
            </div>
            {/* A static sample of the real result, so the page shows what a lookup gives. */}
            <div className="rounded-2xl border p-4 shadow-xs [&_section]:mb-0 [&_section>div]:py-0">
                <VerbNounPairs data={HOME_SAMPLE} />
            </div>
            <ul className="flex flex-wrap justify-center gap-2 list-none" aria-label="Zum Beispiel">
                {EXAMPLE_WORDS.map(({ word, wordClass }) => (
                    <li key={word}>
                        <Link
                            to={`/wort/${encodeURIComponent(word)}`}
                            className="inline-flex min-h-11 md:min-h-8 items-center gap-2 rounded-full border px-4 md:px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                            <span aria-hidden="true" className={cn('size-2 rounded-full', wordClassStyle(wordClass).dot)} />
                            {word}
                        </Link>
                    </li>
                ))}
            </ul>
            {/* Decisions #70, #74: the search box also checks a whole phrase. */}
            <p className="text-sm text-muted-foreground text-center">
                Sie können auch eine ganze Verbindung prüfen, z.&nbsp;B.{' '}
                <Link
                    to={`/wort/Entscheidung?pruefen=${encodeURIComponent('eine Entscheidung machen')}`}
                    className="text-foreground underline underline-offset-4 hover:decoration-2"
                >
                    eine Entscheidung machen
                </Link>{' '}
                oder{' '}
                <Link
                    to={`/wort/Regen?pruefen=${encodeURIComponent('schwerer Regen')}`}
                    className="text-foreground underline underline-offset-4 hover:decoration-2"
                >
                    schwerer Regen
                </Link>
                .
            </p>
        </div>
    );
}

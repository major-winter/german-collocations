import { useEffect } from 'react';
import { Link } from 'react-router';

// Words with plenty of verb-noun pairs, checked against the live data.
const EXAMPLE_WORDS = ['Rolle', 'Entscheidung', 'Kritik', 'Frage', 'Verantwortung', 'Ziel', 'treffen', 'stellen'];

export function Home() {
    useEffect(() => {
        document.title = 'Wortnetz';
    }, []);

    return (
        <div className="py-10 text-center space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-semibold">Welche Wörter passen zusammen?</h2>
                <p className="text-muted-foreground">
                    Geben Sie ein Substantiv ein und sehen Sie, welche Verben dazu passen –
                    mit Beispielsätzen aus echten Texten. Oder umgekehrt: ein Verb und seine Substantive.
                </p>
            </div>
            <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Zum Beispiel:</p>
                <ul className="flex flex-wrap justify-center gap-2 list-none">
                    {EXAMPLE_WORDS.map((exampleWord) => (
                        <li key={exampleWord}>
                            <Link
                                to={`/wort/${encodeURIComponent(exampleWord)}`}
                                className="inline-flex min-h-11 md:min-h-8 items-center rounded-full border px-4 md:px-3 py-1 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                                {exampleWord}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

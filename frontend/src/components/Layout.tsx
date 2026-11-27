import type { ReactNode } from 'react';
import { Link, matchPath, useLocation, useSearchParams } from 'react-router';
import { searchFieldValue } from '@/lib/collocationCheck.ts';
import { SearchBox } from './SearchBox';

interface LayoutProps {
    children: ReactNode;
}

function Logomark() {
    return (
        <Link to="/" className="flex items-center gap-2 shrink-0 min-h-10 min-w-10 justify-center rounded-md">
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-foreground text-background text-xs font-semibold">
                WN
            </span>
            <h1 className="sr-only sm:not-sr-only font-serif text-xl font-semibold text-foreground">
                Wortnetz
            </h1>
        </Link>
    );
}

export function Layout({ children }: LayoutProps) {
    const location = useLocation();

    const match = matchPath("/wort/:word", location.pathname);
    const currentWord = match?.params.word ?? "";
    // #77: the one field shows the check on a word page, so the learner corrects it in place.
    const [searchParams] = useSearchParams();
    const fieldValue = searchFieldValue(currentWord, match ? searchParams.get("pruefen") : null);

    return (
        <div className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-40 border-b bg-background">
                <div className="py-3 sm:py-4 max-w-xl md:max-w-2xl mx-auto px-4 w-full flex items-start gap-3">
                    <Logomark />
                    <div className="flex-1">
                        <SearchBox initialValue={fieldValue} />
                    </div>
                </div>
            </header>

            <main className="flex-1 w-full max-w-xl md:max-w-2xl mx-auto px-4">
                {children}
            </main>

            <footer className="py-6 text-center space-y-1">
                <p className="text-xs text-muted-foreground">
                    Daten: Leipzig Corpora Collection · sortiert nach Kollokationsstärke
                </p>
                <p className="text-xs text-muted-foreground">
                    <Link to="/impressum" className="inline-block py-2 px-1.5 hover:underline">Impressum</Link>
                    {' · '}
                    <Link to="/datenschutz" className="inline-block py-2 px-1.5 hover:underline">Datenschutz</Link>
                </p>
            </footer>
        </div>
    );
}

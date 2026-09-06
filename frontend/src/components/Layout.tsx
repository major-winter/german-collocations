import type { ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router';
import { SearchBox } from './SearchBox';

interface LayoutProps {
    children: ReactNode;
}

function Logomark({ compact }: { compact: boolean }) {
    return (
        <div className={compact ? 'flex items-center gap-2 shrink-0' : 'flex items-center justify-center gap-2'}>
            <span
                className={
                    compact
                        ? 'flex items-center justify-center w-7 h-7 rounded-md bg-primary/70 text-primary-foreground text-xs font-semibold'
                        : 'flex items-center justify-center w-9 h-9 rounded-md bg-primary/70 text-primary-foreground text-sm font-semibold'
                }
            >
                DK
            </span>
            <h1 className={compact ? 'text-lg font-medium' : 'text-4xl font-medium'}>
                Deutsche Kollokationen
            </h1>
        </div>
    );
}

export function Layout({ children }: LayoutProps) {
    const location = useLocation();

    const match = matchPath("/wort/:word", location.pathname);
    const currentWord = match?.params.word ?? "";
    const isWordPage = Boolean(match);

    return (
        <div className="min-h-screen flex flex-col">
            <header
                className={
                    isWordPage
                        ? "pt-4 pb-4 max-w-xl md:max-w-2xl mx-auto px-4 w-full flex flex-col gap-3"
                        : "pt-8 pb-4 text-center max-w-xl md:max-w-2xl mx-auto px-4 w-full"
                }
            >
                {isWordPage ? (
                    <>
                        <Logomark compact />
                        <SearchBox initialValue={currentWord} />
                    </>
                ) : (
                    <>
                        <Logomark compact={false} />
                        <p className="text-sm text-muted-foreground">
                            Hier finden Sie häufige Wortverbindungen
                        </p>
                        <SearchBox initialValue={currentWord} />
                    </>
                )}
            </header>

            <main className="flex-1 w-full max-w-xl md:max-w-2xl mx-auto px-4">
                {children}
            </main>

            <footer className="py-6 text-center">
                <p className="text-xs text-muted-foreground">
                    Data from Leipzig Corpora Collection · Ranked by collocation strength
                </p>
            </footer>
        </div>
    );
}

import type { ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router';
import { SearchBox } from './SearchBox';

interface LayoutProps {
    children: ReactNode;
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
                        ? "pt-4 pb-4 text-left max-w-xl mx-auto px-4 w-full"
                        : "pt-8 pb-4 text-center max-w-xl mx-auto px-4 w-full"
                }
            >
                {isWordPage ? (
                    <h1 className="text-lg font-medium">
                        Deutsche <span className="text-indigo-600 dark:text-indigo-400">Kollokationen</span>
                    </h1>
                ) : (
                    <>
                        <h1 className="text-4xl font-medium">
                            Deutsche <span className="text-indigo-600 dark:text-indigo-400">Kollokationen</span>
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Hier finden Sie häufige Wortverbindungen
                        </p>
                    </>
                )}
                <SearchBox initialValue={currentWord} />
            </header>

            <main className="flex-1 w-full max-w-xl mx-auto px-4">
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

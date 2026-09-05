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
                        ? "pt-4 pb-4 max-w-xl mx-auto px-4 w-full flex items-center gap-3"
                        : "pt-8 pb-4 text-center max-w-xl mx-auto px-4 w-full"
                }
            >
                {isWordPage ? (
                    <>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-600 dark:bg-indigo-500 text-white text-xs font-semibold">
                                DK
                            </span>
                            <h1 className="text-lg font-medium">Deutsche Kollokationen</h1>
                        </div>
                        <div className="flex-1">
                            <SearchBox initialValue={currentWord} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center justify-center gap-2">
                            <span className="flex items-center justify-center w-9 h-9 rounded-md bg-indigo-600 dark:bg-indigo-500 text-white text-sm font-semibold">
                                DK
                            </span>
                            <h1 className="text-4xl font-medium">Deutsche Kollokationen</h1>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Hier finden Sie häufige Wortverbindungen
                        </p>
                        <SearchBox initialValue={currentWord} />
                    </>
                )}
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

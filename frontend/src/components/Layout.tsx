import type { ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router';
import { SearchBox } from './SearchBox';

interface LayoutProps {
    children: ReactNode;
}

function Logomark() {
    return (
        <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-white text-blue-900 text-xs font-semibold">
                WN
            </span>
            <h1 className="text-lg font-semibold text-white">
                Wortnetz
            </h1>
        </div>
    );
}

export function Layout({ children }: LayoutProps) {
    const location = useLocation();

    const match = matchPath("/wort/:word", location.pathname);
    const currentWord = match?.params.word ?? "";

    return (
        <div className="min-h-screen flex flex-col">
            <header className="bg-blue-900">
                <div className="py-4 max-w-xl md:max-w-2xl mx-auto px-4 w-full flex items-center gap-3">
                    <Logomark />
                    <div className="flex-1">
                        <SearchBox initialValue={currentWord} />
                    </div>
                </div>
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

interface LayoutProps {
    children: React.ReactNode
}

import type { ReactNode } from 'react';

interface LayoutProps {
    children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="min-h-screen flex flex-col">
            <header className="pt-8 pb-4 text-center">
                <h1 className="text-4xl font-medium">Deustche Kollokationen</h1>
                <p className="text-sm text-muted-foreground">
                    Hier finden Sie häufige Wortverbindungen
                </p>
            </header>

            <main className="flex-1 w-full max-w-xl mx-auto px-4">
                {children}
            </main>

            <footer className="py-6 text-center">
                <p className="text-xs text-muted-foreground">
                    Data from Leipzig Corpora Collection · Ranked by statistical significance
                </p>
            </footer>
        </div>
    );
}

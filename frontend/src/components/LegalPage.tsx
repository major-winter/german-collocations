import { useEffect, type ReactNode } from 'react';
import { OPERATOR } from '@/lib/impressum.ts';

// Shared frame for /impressum and /datenschutz (#72).

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
    useEffect(() => {
        document.title = `${title} · Wortnetz`;
    }, [title]);

    return (
        <article className="py-8 space-y-5 text-sm leading-relaxed [&_h3]:font-serif [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-1.5 [&_a]:underline">
            <h1 className="font-serif text-3xl font-semibold">{title}</h1>
            {OPERATOR.placeholder && (
                <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground">
                    Entwicklungsansicht: Die Angaben in eckigen Klammern werden beim Produktions-Build aus
                    der Server-Konfiguration eingesetzt.
                </p>
            )}
            {children}
        </article>
    );
}

export function OperatorAddress() {
    return (
        <address className="not-italic">
            {OPERATOR.name}
            {OPERATOR.addressLines.map((line) => (
                <span key={line}>
                    <br />
                    {line}
                </span>
            ))}
            <br />
            E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        </address>
    );
}

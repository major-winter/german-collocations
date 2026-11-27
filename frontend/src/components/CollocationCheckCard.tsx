import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { CheckPhrase, CollocationCheck } from '@collocations/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { checkMatchesPage, phraseParts, verdictLabel } from '@/lib/collocationCheck.ts';
import { wordClassStyle } from '@/lib/wordClass.ts';
import { fetchCheck } from '../api/check.ts';
import { API_BASE_URL } from '../config.ts';

// Decision #70: "Passt das zusammen?" on a noun page. The check lives in
// the URL (?pruefen=…), so the back button and shared links work.

const PARAM = 'pruefen';

type Parsed = Extract<CollocationCheck, { parsed: true }>;

function Phrase({ phrase }: { phrase: CheckPhrase }) {
    return (
        <>
            {phraseParts(phrase).map((part, i) =>
                part.kind === 'plain' ? (
                    <span key={i}>{part.text}</span>
                ) : (
                    <span key={i} className={cn(wordClassStyle(part.kind).text, part.kind === 'noun' && 'font-semibold')}>
                        {part.text}
                    </span>
                ),
            )}
        </>
    );
}

// The phrase as typed, with the noun and the typed verb form coloured.
function typedPhrase(check: Parsed): CheckPhrase {
    const nounWord = check.phrase.split(' ').find((t) => t.toLowerCase() === check.noun.toLowerCase()) ?? check.noun;
    return { phrase: check.phrase, nounWord, verbWord: check.verbTyped };
}

function Verdict({ check }: { check: Parsed }) {
    const verb = check.verb ?? check.verbTyped;
    return (
        <>
            <span
                className={cn(
                    'inline-block rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide',
                    check.verdict === 'usual' ? 'text-foreground' : 'text-muted-foreground',
                )}
            >
                {verdictLabel(check.verdict)}
            </span>
            <p className="font-serif text-xl mt-2 mb-1.5">
                {check.verdict === 'unusual' ? (
                    <s className="decoration-muted-foreground">
                        <Phrase phrase={typedPhrase(check)} />
                    </s>
                ) : (
                    <Phrase phrase={check.matched ?? typedPhrase(check)} />
                )}
            </p>
            <p className="text-sm text-muted-foreground mb-2.5 leading-snug">
                {check.verdict === 'usual' && (
                    <>Eine gängige Verbindung.{check.suggestions.length > 0 && ' Noch häufiger:'}</>
                )}
                {check.verdict === 'unusual' && (
                    <>
                        In unseren Texten (Nachrichten, Wikipedia, Web) ist <i>{verb}</i> kein typisches Verb zu{' '}
                        <i>{check.noun}</i>. Typisch sind:
                    </>
                )}
                {check.verdict === 'noData' && (
                    <>
                        Zu <i>{check.noun}</i> haben wir in unseren Texten keine Verben gefunden. Das heißt nicht, dass
                        die Verbindung falsch ist – wir können sie nur nicht prüfen.
                    </>
                )}
            </p>
            {check.suggestions.length > 0 && (
                <ul className="font-serif text-lg list-none p-0 mb-3 space-y-1.5">
                    {check.suggestions.map((s) => (
                        <li key={s.phrase}>
                            <span className="text-muted-foreground">→ </span>
                            <Phrase phrase={s} />
                        </li>
                    ))}
                </ul>
            )}
            {check.verdict === 'unusual' && (
                <p className="text-xs text-muted-foreground mb-3">
                    Alltägliche Verbindungen wie <i>Kaffee bestellen</i> fehlen in unseren Texten manchmal.
                </p>
            )}
        </>
    );
}

interface CollocationCheckCardProps {
    word: string;      // the page's word
    lemma: string;     // the lab lemma the page matched
    showField: boolean; // the noun has object pairs to check against
}

export function CollocationCheckCard({ word, lemma, showField }: CollocationCheckCardProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get(PARAM);
    // The last parsed check, tagged with the query and page it was for, so a
    // new query hides the old verdict without resetting state in the effect.
    const key = `${query}\u0000${word}\u0000${lemma}`;
    const [result, setResult] = useState<{ key: string; check: Parsed } | null>(null);
    const check = result?.key === key ? result.check : null;
    const [verb, setVerb] = useState('');

    useEffect(() => {
        if (!query) return;
        const controller = new AbortController();
        fetchCheck(API_BASE_URL, query, controller.signal)
            .then((result) => {
                if (result.parsed && checkMatchesPage(result, word, lemma)) {
                    setResult({ key, check: result });
                    setVerb(result.verbTyped);
                }
            })
            .catch(() => {
                // A failed check shows the page without a card, never an error.
            });
        return () => controller.abort();
    }, [query, word, lemma, key]);

    if (!check && !showField) return null;

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = verb.trim();
        if (!trimmed) return;
        setSearchParams({ [PARAM]: `${word} ${trimmed}` });
    }

    return (
        <section className="mt-4 mb-3 rounded-xl border p-3.5" aria-label="Verbindung prüfen">
            {/* Announced when a check arrives; the field the learner just used sits below it. */}
            <div aria-live="polite">{check && <Verdict check={check} />}</div>
            <form onSubmit={handleSubmit} className={cn('flex items-center gap-2', check && 'border-t pt-3')}>
                <label htmlFor="check-verb" className="text-sm text-muted-foreground whitespace-nowrap">
                    Verb prüfen
                </label>
                <Input
                    id="check-verb"
                    type="text"
                    value={verb}
                    onChange={(e) => setVerb(e.target.value)}
                    placeholder="ein Verb"
                    enterKeyHint="go"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-10 md:h-8 min-w-0 flex-1 md:text-base"
                />
                <Button type="submit" className="h-10 md:h-8">
                    Prüfen
                </Button>
            </form>
        </section>
    );
}

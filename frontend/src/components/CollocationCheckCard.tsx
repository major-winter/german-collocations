import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { CheckPhrase, CollocationCheck } from '@collocations/types';
import { cn } from '@/lib/utils';
import {
    checkMatchesPage,
    checkTarget,
    partnerKind,
    partnerTyped,
    phraseParts,
    historyStateWithoutCheck,
    preloadedCheck,
    unusualReason,
    verdictLabel,
    type PartnerKind,
} from '@/lib/collocationCheck.ts';
import { wordClassStyle } from '@/lib/wordClass.ts';
import { fetchCheck } from '../api/check.ts';
import { API_BASE_URL } from '../config.ts';

// Decision #70: "Passt das zusammen?" on a noun page. The check lives in
// the URL (?pruefen=…), so the back button and shared links work. #74 adds
// adjective + noun: the same card, with the partner's word class. #75: the
// field takes a whole phrase, like the search box, so both agree. #76 adds
// a verb with a prepositional noun ("an einer Sitzung teilnehmen"). #77:
// the card has no field of its own any more; the header search box is the
// one input, and the card shows the verdict or a hint pointing at it.

const PARAM = 'pruefen';

type Parsed = Extract<CollocationCheck, { parsed: true }>;

function Phrase({ phrase, partner }: { phrase: CheckPhrase; partner: PartnerKind }) {
    return (
        <>
            {phraseParts(phrase, partner).map((part, i) =>
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

// The phrase as typed, with the noun and the typed partner form coloured.
function typedPhrase(check: Parsed): CheckPhrase {
    const nounWord = check.phrase.split(' ').find((t) => t.toLowerCase() === check.noun.toLowerCase()) ?? check.noun;
    return { phrase: check.phrase, nounWord, partnerWord: partnerTyped(check) };
}

function Verdict({ check }: { check: Parsed }) {
    const partner = partnerKind(check);
    // An adjective is named as typed: the tagger's lemmas read oddly in a
    // sentence ("erster", "reg" for "rege").
    const partnerLemma = check.relation === 'amod' ? check.adjectiveTyped.toLowerCase() : (check.verb ?? check.verbTyped);
    const typical = partner === 'adjective' ? 'typisches Adjektiv' : 'typisches Verb';
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
                        <Phrase phrase={typedPhrase(check)} partner={partner} />
                    </s>
                ) : (
                    <Phrase phrase={check.matched ?? typedPhrase(check)} partner={partner} />
                )}
            </p>
            <p className="text-sm text-muted-foreground mb-2.5 leading-snug">
                {check.verdict === 'usual' && (
                    <>Eine gängige Verbindung.{check.suggestions.length > 0 && ' Noch häufiger:'}</>
                )}
                {check.verdict === 'unusual' &&
                    (unusualReason(check) === 'preposition' ? (
                        <>
                            Mit <i>{partnerLemma}</i> steht bei <i>{check.noun}</i> meist eine andere Präposition.
                            {check.suggestions.length > 0 && ' Typisch sind:'}
                        </>
                    ) : check.relation === 'obl' ? (
                        <>
                            In unseren Texten (Nachrichten, Wikipedia, Web) ist <i>{partnerLemma}</i> mit{' '}
                            <i>
                                {check.prepositionTyped.toLowerCase()} … {check.noun}
                            </i>{' '}
                            keine typische Verbindung.{check.suggestions.length > 0 && ' Typisch sind:'}
                        </>
                    ) : (
                        <>
                            In unseren Texten (Nachrichten, Wikipedia, Web) ist <i>{partnerLemma}</i> kein {typical} zu{' '}
                            <i>{check.noun}</i>.{check.suggestions.length > 0 && ' Typisch sind:'}
                        </>
                    ))}
                {check.verdict === 'noData' && (
                    <>
                        Zu <i>{check.noun}</i> haben wir in unseren Texten{' '}
                        {partner === 'adjective'
                            ? 'zu wenige Adjektive'
                            : check.relation === 'obl'
                              ? 'keine Verben mit Präposition'
                              : 'keine Verben'}{' '}
                        gefunden. Das heißt nicht, dass die Verbindung falsch ist – wir können sie nur nicht prüfen.
                    </>
                )}
            </p>
            {check.suggestions.length > 0 && (
                <ul className="font-serif text-lg list-none p-0 mb-3 space-y-1.5">
                    {check.suggestions.map((s) => (
                        <li key={s.phrase}>
                            <span className="text-muted-foreground">→ </span>
                            <Phrase phrase={s} partner={partner} />
                        </li>
                    ))}
                </ul>
            )}
            {check.verdict === 'unusual' && (
                <p className="text-xs text-muted-foreground mb-3">
                    {partner === 'adjective' ? (
                        <>Alltägliche Verbindungen fehlen in unseren Texten manchmal.</>
                    ) : (
                        <>
                            Alltägliche Verbindungen wie <i>Kaffee bestellen</i> fehlen in unseren Texten manchmal.
                        </>
                    )}
                </p>
            )}
        </>
    );
}

interface CollocationCheckCardProps {
    word: string;      // the page's word
    lemma: string;     // the lab lemma the page matched
    showHint: boolean; // the noun has object pairs, prepositional pairs or adjectives to check against
    hintExample: string | null; // a phrase the hint offers to check (#77)
}

export function CollocationCheckCard({ word, lemma, showHint, hintExample }: CollocationCheckCardProps) {
    const [searchParams] = useSearchParams();
    const query = searchParams.get(PARAM);
    const location = useLocation();
    // The search box already fetched this check (#77): show it without a second request.
    const preloaded = preloadedCheck(location.state, query, word, lemma);
    // The last check, tagged with the query and page it was for, so a new
    // query hides the old verdict without resetting state in the effect.
    // A null check is a phrase the server could not parse.
    const key = `${query}\u0000${word}\u0000${lemma}`;
    const [result, setResult] = useState<{ key: string; check: Parsed | null } | null>(null);
    const current = result?.key === key ? result : null;
    const check = preloaded ?? current?.check ?? null;
    const unparsed = !preloaded && current !== null && current.check === null;
    const navigate = useNavigate();
    const hasPreloaded = preloaded !== null;

    // Used once: drop it from the history entry, so a reload or a later
    // back/forward asks the server again. Not through the router, which
    // would re-render without it and fetch now.
    useEffect(() => {
        if (hasPreloaded) window.history.replaceState(historyStateWithoutCheck(window.history.state), '');
    }, [hasPreloaded]);

    useEffect(() => {
        if (!query || hasPreloaded) return;
        const controller = new AbortController();
        fetchCheck(API_BASE_URL, query, controller.signal)
            .then((result) => {
                if (!result.parsed) {
                    setResult({ key, check: null });
                } else if (checkMatchesPage(result, word, lemma)) {
                    setResult({ key, check: result });
                } else {
                    // A phrase about another noun ("eine Entscheidung treffen"
                    // typed on the Regen page) opens that noun's page.
                    const target = checkTarget(result);
                    if (target) navigate(target, { replace: true, state: { check: result } });
                }
            })
            .catch(() => {
                // A failed check shows the page without a card, never an error.
            });
        return () => controller.abort();
    }, [query, word, lemma, key, navigate, hasPreloaded]);

    if (!check && !unparsed) {
        if (!showHint) return null;
        return (
            <p className="mt-4 mb-3 text-sm text-muted-foreground leading-snug">
                Passt ein Wort zu <i>{word}</i>? Geben Sie oben die ganze Verbindung ein
                {hintExample !== null && (
                    <>
                        , z.&nbsp;B.{' '}
                        <Link
                            to={{ search: `?${PARAM}=${encodeURIComponent(hintExample)}` }}
                            className="italic underline underline-offset-2 hover:text-foreground">
                            {hintExample}
                        </Link>
                    </>
                )}
                .
            </p>
        );
    }

    return (
        <section className="mt-4 mb-3 rounded-xl border p-3.5" aria-label="Verbindung prüfen">
            {/* Announced when a check arrives; the learner corrects the phrase in the header field. */}
            <div aria-live="polite">
                {check && <Verdict check={check} />}
                {unparsed && (
                    <p className="text-sm text-muted-foreground">
                        Das können wir nicht prüfen. Geben Sie ein Nomen mit Verb oder Adjektiv ein, z. B.{' '}
                        <i>Entscheidung treffen</i>, <i>starker Regen</i> oder{' '}
                        <i>an einer Sitzung teilnehmen</i>.
                    </p>
                )}
            </div>
        </section>
    );
}

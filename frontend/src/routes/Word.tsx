import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import type { CollocationResponse, WordSuggestion } from "@collocations/types";
import { fetchCollocations } from "../api/collocations.ts";
import { fetchSearch } from "../api/search.ts";
import { Button } from "@/components/ui/button";
import { CollocationCheckCard } from "../components/CollocationCheckCard.tsx";
import { CollocationList } from "../components/CollocationList.tsx";
import { StatusMessage } from "../components/StatusMessage.tsx";
import { LoseFaden } from "../components/WortNetz.tsx";
import { PosLegend } from "../components/PosLegend.tsx";
import { VerbNounPairs } from "../components/VerbNounPairs.tsx";
import { hasAnyResults, isThinPage } from "../lib/verbNounGroups.ts";
import { legendSections } from "../lib/wordClass.ts";
import { checkHintExample } from "../lib/collocationCheck.ts";

import { API_BASE_URL } from "../config.ts";

type LookupState =
    | { status: "loading" }
    | { status: "notFound"; suggestions: WordSuggestion[] }
    | { status: "error"; message: string }
    | { status: "ok"; data: CollocationResponse };

function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === "AbortError";
}

export function Word() {
    const { word } = useParams<{ word: string }>();
    const [attempt, setAttempt] = useState(0); // bumped by "Erneut versuchen" to refetch
    // The last finished lookup, tagged with the word and attempt it was for.
    // Anything else is still loading, so a new word shows "Wird geladen" at
    // once without resetting state inside the effect.
    const key = `${word}\u0000${attempt}`;
    const [result, setResult] = useState<{ key: string; state: LookupState } | null>(null);
    const state: LookupState = result?.key === key ? result.state : { status: "loading" };

    useEffect(() => {
        document.title = word ? `${word} – Wortnetz` : 'Wortnetz';
    }, [word]);

    useEffect(() => {
        if (!word) return;

        const controller = new AbortController();
        const setState = (next: LookupState) => setResult({ key, state: next });

        async function run() {
            try {
                const data = await fetchCollocations(
                    API_BASE_URL,
                    word!,
                    controller.signal,
                );

                if (data === null) {
                    const suggestions = await fetchSearch(
                        API_BASE_URL,
                        word!,
                        controller.signal,
                    );
                    setState({ status: "notFound", suggestions });
                    return;
                }

                setState({ status: "ok", data });
            } catch (err) {
                if (isAbortError(err)) {
                    return;
                }
                setState({
                    status: "error",
                    message: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
                });
            }
        }

        run();

        return () => controller.abort();
    }, [word, key]);

    if (state.status === "loading") {
        return (
            <StatusMessage role="status">Wird geladen …</StatusMessage>
        );
    }

    if (state.status === "error") {
        return (
            <StatusMessage
                role="alert"
                title={state.message}
                action={
                    <Button variant="outline" className="h-10 px-4" onClick={() => setAttempt((n) => n + 1)}>
                        Erneut versuchen
                    </Button>
                }
            />
        );
    }

    if (state.status === "notFound") {
        return (
            <div className="mt-8">
            <LoseFaden word={word ?? ""} />
            <StatusMessage className="mt-4" title={<>Keine Ergebnisse für „{word}“</>}>
                {state.suggestions.length > 0 ? (
                    <div className="space-y-2">
                        <p>Meinten Sie:</p>
                        <ul className="flex flex-wrap gap-2 list-none p-0">
                            {state.suggestions.map((s) => (
                                <li key={s.word}>
                                    <Link to={`/wort/${encodeURIComponent(s.word)}`}
                                        className="inline-flex min-h-11 md:min-h-8 items-center rounded-full border px-4 md:px-3 py-1 text-sm text-foreground
                                        hover:bg-accent hover:text-accent-foreground
                                        transition-colors">
                                        {s.word}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p>Auch keine ähnlichen Wörter gefunden.</p>
                )}
            </StatusMessage>
            </div>
        );
    }

    return (
        <div>
            {/* Wraps and hyphenates (lang="de") so long compounds never scroll the page sideways. */}
            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="min-w-0 font-serif text-3xl sm:text-4xl font-semibold break-words hyphens-auto">
                    {/* Decision #69: the article, muted, only when the searched word is the lemma itself. */}
                    {state.data.verbNounPairs?.article && state.data.verbNounPairs.lemma === state.data.word && (
                        <span className="font-normal text-muted-foreground">{state.data.verbNounPairs.article} </span>
                    )}
                    {state.data.word}
                </h2>
                {state.data.verbNounPairs && (
                    <span className="text-sm text-muted-foreground">
                        {state.data.verbNounPairs.side === "noun" ? "Substantiv" : "Verb"}
                    </span>
                )}
            </div>
            <PosLegend sections={legendSections(state.data)} />
            {/* Decisions #70, #74, #76: "Passt das zusammen?" on noun pages, for verbs, adjectives and prepositional verbs. */}
            {state.data.verbNounPairs?.side === "noun" && (
                <CollocationCheckCard
                    word={state.data.word}
                    lemma={state.data.verbNounPairs.lemma}
                    showHint={
                        state.data.verbNounPairs.pairs.some((p) => p.relation === "obj" || p.relation === "obl") ||
                        state.data.collocations.some((c) => c.section === "adjective")
                    }
                    hintExample={checkHintExample(state.data.verbNounPairs.pairs)}
                />
            )}
            {/* Decision #60: verbs (or nouns) first - what the user came for. */}
            {state.data.verbNounPairs && (
                <VerbNounPairs key={state.data.word} data={state.data.verbNounPairs} />
            )}
            <CollocationList
                key={state.data.word}
                word={state.data.word}
                entries={state.data.collocations}
                showEmptyMessage={!hasAnyResults(state.data)}
                openFirst={(state.data.verbNounPairs?.pairs.length ?? 0) === 0}
            />
            {/* Decision #79: rare words keep only well-attested partners, so say why the page is short. */}
            {isThinPage(state.data) && (
                <StatusMessage className="mt-2 mb-6">
                    Zu <i>{state.data.word}</i> haben wir noch wenige Verbindungen: Wir zeigen nur, was in
                    mindestens drei Sätzen unserer Texte vorkommt.
                </StatusMessage>
            )}
        </div>
    );
}

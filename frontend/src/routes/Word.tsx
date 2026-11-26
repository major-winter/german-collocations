import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import type { CollocationResponse, WordSuggestion } from "@collocations/types";
import { fetchCollocations } from "../api/collocations.ts";
import { fetchSearch } from "../api/search.ts";
import { CollocationCheckCard } from "../components/CollocationCheckCard.tsx";
import { CollocationList } from "../components/CollocationList.tsx";
import { PosLegend } from "../components/PosLegend.tsx";
import { VerbNounPairs } from "../components/VerbNounPairs.tsx";
import { hasAnyResults } from "../lib/verbNounGroups.ts";
import { legendSections } from "../lib/wordClass.ts";

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
    const [state, setState] = useState<LookupState>({ status: "loading" });

    useEffect(() => {
        document.title = word ? `${word} – Wortnetz` : 'Wortnetz';
    }, [word]);

    useEffect(() => {
        if (!word) return;

        const controller = new AbortController();
        setState({ status: "loading" });

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
    }, [word]);

    if (state.status === "loading") {
        return <p className="text-sm text-muted-foreground text-center">Wird geladen …</p>;
    }

    if (state.status === "error") {
        return <p role="alert" className="text-sm text-center">{state.message}</p>;
    }

    if (state.status === "notFound") {
        return (
            <div className="text-center">
                <p>Keine Ergebnisse für „{word}“.</p>
                {state.suggestions.length > 0 ? (
                    <div>
                        <p>Meinten Sie:</p>
                        <ul className="flex flex-wrap justify-center gap-2 list-none">
                            {state.suggestions.map((s) => (
                                <li key={s.word}>
                                    <Link to={`/wort/${encodeURIComponent(s.word)}`}
                                        className="inline-flex min-h-11 md:min-h-8 items-center rounded-md border px-3 py-1 text-sm
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
            </div>
        );
    }

    return (
        <div>
            <div className="mt-6 flex items-baseline gap-3">
                <h2 className="font-serif text-4xl font-semibold">
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
            {/* Decision #70: "Passt das zusammen?" on noun pages. */}
            {state.data.verbNounPairs?.side === "noun" && (
                <CollocationCheckCard
                    word={state.data.word}
                    lemma={state.data.verbNounPairs.lemma}
                    showField={state.data.verbNounPairs.pairs.some((p) => p.relation === "obj")}
                />
            )}
            {/* Decision #60: verbs (or nouns) first - what the user came for. */}
            {state.data.verbNounPairs && (
                <VerbNounPairs key={state.data.word} data={state.data.verbNounPairs} />
            )}
            <CollocationList
                word={state.data.word}
                entries={state.data.collocations}
                showEmptyMessage={!hasAnyResults(state.data)}
            />
        </div>
    );
}

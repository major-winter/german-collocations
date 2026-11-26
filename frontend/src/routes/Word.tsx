import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import type { CollocationResponse, WordSuggestion } from "@collocations/types";
import { fetchCollocations } from "../api/collocations.ts";
import { fetchSearch } from "../api/search.ts";
import { Button } from "@/components/ui/button";
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
    const [attempt, setAttempt] = useState(0); // bumped by "Erneut versuchen" to refetch

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
    }, [word, attempt]);

    if (state.status === "loading") {
        return (
            <p role="status" className="mt-10 text-sm text-muted-foreground text-center">
                Wird geladen …
            </p>
        );
    }

    if (state.status === "error") {
        return (
            <div className="mt-10 text-center space-y-3">
                <p role="alert">{state.message}</p>
                <Button variant="outline" className="h-10 px-4" onClick={() => setAttempt((n) => n + 1)}>
                    Erneut versuchen
                </Button>
            </div>
        );
    }

    if (state.status === "notFound") {
        return (
            <div className="mt-10 text-center space-y-4">
                <h2 className="font-serif text-2xl font-semibold break-words hyphens-auto">
                    Keine Ergebnisse für „{word}“
                </h2>
                {state.suggestions.length > 0 ? (
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Meinten Sie:</p>
                        <ul className="flex flex-wrap justify-center gap-2 list-none p-0">
                            {state.suggestions.map((s) => (
                                <li key={s.word}>
                                    <Link to={`/wort/${encodeURIComponent(s.word)}`}
                                        className="inline-flex min-h-11 md:min-h-8 items-center rounded-full border px-4 md:px-3 py-1 text-sm
                                        hover:bg-accent hover:text-accent-foreground
                                        transition-colors">
                                        {s.word}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="text-muted-foreground">Auch keine ähnlichen Wörter gefunden.</p>
                )}
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

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import type { CollocationResponse, WordSuggestion } from "@collocations/types";
import { fetchCollocations } from "../api/collocations.ts";
import { fetchSearch } from "../api/search.ts";
import { CollocationList } from "../components/CollocationList.tsx";

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
                    message: "Something went wrong. Please try again.",
                });
            }
        }

        run();

        return () => controller.abort();
    }, [word]);

    if (state.status === "loading") {
        return <p>Loading…</p>;
    }

    if (state.status === "error") {
        return <p role="alert">{state.message}</p>;
    }

    if (state.status === "notFound") {
        return (
            <div>
                <p>No results for "{word}".</p>
                {state.suggestions.length > 0 ? (
                    <div>
                        <p>Did you mean:</p>
                        <ul className="flex flex-wrap gap-2 list-none">
                            {state.suggestions.map((s) => (
                                <li key={s.word}>
                                    <Link to={`/wort/${encodeURIComponent(s.word)}`}
                                        className="inline-flex item-center rounded-md border px-3 py-1 text-sm
                                        hover:bg-accent hover:text-accent-foreground
                                        transition-colors">
                                        {s.word}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p>No suggestions found either.</p>
                )}
            </div>
        );
    }

    return (
        <div>
            <CollocationList entries={state.data.collocations} />
        </div>
    );
}

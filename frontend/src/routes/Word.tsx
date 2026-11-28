import { useEffect, useState } from "react";
import { useParams, Link, useNavigationType } from "react-router";
import type { CollocationResponse, WordSuggestion } from "@collocations/types";
import { fetchCollocations } from "../api/collocations.ts";
import { fetchSearch } from "../api/search.ts";
import { Button } from "@/components/ui/button";
import { CollocationCheckCard } from "../components/CollocationCheckCard.tsx";
import { CollocationList } from "../components/CollocationList.tsx";
import { StatusMessage } from "../components/StatusMessage.tsx";
import { LoseFaden } from "../components/WortNetz.tsx";
import { JumpStrip } from "../components/JumpStrip.tsx";
import { VerbNounPairs } from "../components/VerbNounPairs.tsx";
import { groupCount, hasAnyResults, isThinPage } from "../lib/verbNounGroups.ts";
import { arrivalAnnouncement, movesFocusOnArrival } from "../lib/arrival.ts";
import { cn } from "@/lib/utils";
import { resultKeys } from "../lib/resultKeys.ts";
import { jumpGroups } from "../lib/jumpGroups.ts";
import { checkHintExample } from "../lib/collocationCheck.ts";

import { API_BASE_URL } from "../config.ts";

type LookupState =
    | { status: "loading" }
    | { status: "notFound"; suggestions: WordSuggestion[] }
    | { status: "error"; message: string }
    | { status: "ok"; data: CollocationResponse };

// Ankunft: the headword (or the not-found title) is the page's h1 and takes focus.
const HEADING_ID = "lookup-heading";

function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === "AbortError";
}

export function Word() {
    const { word } = useParams<{ word: string }>();
    const [attempt, setAttempt] = useState(0); // bumped by "Erneut versuchen" to refetch
    // The last finished lookup, tagged with the word and attempt it was for.
    // While the next one loads, that old page stays on screen, dimmed (Ankunft),
    // instead of collapsing to "Wird geladen". Every lookup ends in a result
    // (ok, notFound or error), so the dim never outlives its request.
    const key = `${word}\u0000${attempt}`;
    const [result, setResult] = useState<{ key: string; word: string; state: Exclude<LookupState, { status: "loading" }> } | null>(null);
    const stale = result !== null && result.key !== key;
    const navigationType = useNavigationType();

    useEffect(() => {
        document.title = word ? `${word} – Wortnetz` : 'Wortnetz';
    }, [word]);

    useEffect(() => {
        if (!word) return;

        const controller = new AbortController();
        const setState = (next: Exclude<LookupState, { status: "loading" }>) =>
            setResult({ key, word: word!, state: next });

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

    // A finished lookup moves focus to the heading and scrolls to the top, but
    // only for a navigation the learner started (search, link, retry), never
    // for back/forward or the first load. An error keeps focus: its alert speaks.
    useEffect(() => {
        if (!result || result.state.status === "error") return;
        const retried = attempt > 0;
        if (!retried && !movesFocusOnArrival(navigationType)) return;
        if (!retried) window.scrollTo(0, 0);
        document.getElementById(HEADING_ID)?.focus({ preventScroll: true });
        // Only a new result may move focus, not a later navigation type change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    if (!result) {
        return <StatusMessage role="status">Wird geladen …</StatusMessage>;
    }

    const state = result.state;
    const shownWord = result.word;
    const announcement = arrivalAnnouncement(
        state.status === "ok"
            ? { status: "ok", word: state.data.word, groups: groupCount(state.data) }
            : state.status === "notFound"
              ? { status: "notFound", word: shownWord, suggestions: state.suggestions.length }
              : { status: "error" },
    );

    return (
        <>
            {/* Always mounted, so a screen reader hears the text change when a lookup finishes. */}
            <p className="sr-only" role="status" aria-live="polite">
                {stale ? "" : announcement}
            </p>
            <div
                aria-busy={stale}
                inert={stale}
                className={cn(
                    "transition-opacity",
                    // Dim only after a pause, so a fast lookup never flickers; reduced motion: no fade.
                    stale ? "opacity-60 delay-200 duration-300 motion-reduce:transition-none" : "duration-0",
                )}
            >
                <WordPage state={state} shownWord={shownWord} onRetry={() => setAttempt((n) => n + 1)} />
            </div>
        </>
    );
}

function WordPage({
    state,
    shownWord,
    onRetry,
}: {
    state: Exclude<LookupState, { status: "loading" }>;
    shownWord: string;
    onRetry: () => void;
}) {

    if (state.status === "error") {
        return (
            <StatusMessage
                role="alert"
                title={state.message}
                action={
                    <Button variant="outline" className="h-10 px-4" onClick={onRetry}>
                        Erneut versuchen
                    </Button>
                }
            />
        );
    }

    if (state.status === "notFound") {
        return (
            <div className="mt-8">
            <LoseFaden word={shownWord} />
            <StatusMessage className="mt-4" titleId={HEADING_ID} title={<>Keine Ergebnisse für „{shownWord}“</>}>
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
                <h1
                    id={HEADING_ID}
                    tabIndex={-1}
                    className="min-w-0 font-serif text-3xl sm:text-4xl font-semibold break-words hyphens-auto outline-none">
                    {/* Decision #69: the article, muted, only when the searched word is the lemma itself. */}
                    {state.data.verbNounPairs?.article && state.data.verbNounPairs.lemma === state.data.word && (
                        <span className="font-normal text-muted-foreground">{state.data.verbNounPairs.article} </span>
                    )}
                    {state.data.word}
                </h1>
                {state.data.verbNounPairs && (
                    <span className="text-sm text-muted-foreground">
                        {state.data.verbNounPairs.side === "noun" ? "Substantiv" : "Verb"}
                    </span>
                )}
            </div>
            <JumpStrip groups={jumpGroups(state.data)} />
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
                <VerbNounPairs key={resultKeys(state.data.word).pairs} data={state.data.verbNounPairs} />
            )}
            <CollocationList
                key={resultKeys(state.data.word).list}
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

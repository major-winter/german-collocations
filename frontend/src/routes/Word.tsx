import type { CollocationResponse } from "@collocations/types";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { fetchCollocations } from "../api/collocations";
import { API_BASE_URL } from "../config";
import { SearchBox } from "../components/SearchBox";
import { CollocationList } from "../components/CollocationList";

type LookupState =
    | { status: 'loading' }
    | { status: 'notFound' }
    | { status: 'error'; message: string }
    | { status: 'ok'; data: CollocationResponse }

export function Word() {
    const { word } = useParams<{ word: string }>();
    const [state, setState] = useState<LookupState>({ status: 'loading' });

    useEffect(() => {
        if (!word) return;
        const controller = new AbortController();

        setState({ status: "loading" });

        fetchCollocations(API_BASE_URL, word, controller.signal)
            .then((data) => {
                setState(data === null ? { status: "notFound" } : { status: "ok", data })
            })
            .catch((err: unknown) => {
                if (err instanceof Error && err.name === "AbortError") return;
                setState({
                    status: "error",
                    message: err instanceof Error ? err.message : "Unknown error"
                });
            });

        return () => controller.abort();
    }, [word]);

    return (
        <main>
            <SearchBox initialValue={word ?? ''} />

            {state.status === 'loading' && <p>Loading…</p>}

            {state.status === 'notFound' && (
                <p>„{word}" was not found in the corpus.</p>
            )}

            {state.status === 'error' && (
                <p role="alert">Something went wrong: {state.message}</p>
            )}

            {state.status === 'ok' && (
                <>
                    <CollocationList
                        title="Commonly followed by"
                        entries={state.data.followedBy}
                    />
                    <CollocationList
                        title="Commonly preceded by"
                        entries={state.data.precededBy}
                    />
                </>
            )}
        </main>
    );

}

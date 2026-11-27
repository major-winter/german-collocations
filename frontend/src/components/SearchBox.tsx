import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { CollocationCheck } from '@collocations/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoaderCircle, Search } from 'lucide-react';
import { isPhraseQuery, searchRoute, showsSearchHint } from '@/lib/collocationCheck.ts';
import { fetchCheck } from '../api/check.ts';
import { API_BASE_URL } from '../config.ts';
import { UnparsedCheckHint } from './UnparsedCheckHint.tsx';

interface SearchBoxProps {
    /** The page's word, or the check in the URL (#77); already decoded. */
    initialValue: string;
}

const HINT_ID = 'search-check-hint';

export function SearchBox({ initialValue }: SearchBoxProps) {
    const [value, setValue] = useState(initialValue);
    // When the page's word changes (navigation), show it in the field:
    // adjusting state during render, React's alternative to an effect.
    const [shownInitial, setShownInitial] = useState(initialValue);
    if (initialValue !== shownInitial) {
        setShownInitial(initialValue);
        setValue(initialValue);
    }
    const [checking, setChecking] = useState(false); // a phrase is being sent to /api/check
    // #78: the phrase the server could not read. The hint shows while the
    // field still holds it, so editing the phrase or navigating hides it.
    const [hintFor, setHintFor] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const showHint = showsSearchHint(hintFor, value, searchParams.get('pruefen'));
    const navigate = useNavigate();

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed || checking) return;
        // Decision #70: a phrase like "eine Entscheidung machen" opens its noun
        // page with the check. #77: the check rides along in the navigation
        // state, so the card does not fetch it a second time. #78: a longer
        // phrase the server cannot read shows the hint here, on the page the
        // learner is on, instead of "Keine Ergebnisse".
        let check: CollocationCheck | null = null;
        if (isPhraseQuery(trimmed)) {
            setChecking(true);
            check = await fetchCheck(API_BASE_URL, trimmed).catch(() => null);
            setChecking(false);
        }
        const route = searchRoute(trimmed, check);
        if (route.kind === 'hint') {
            setHintFor(trimmed);
            return;
        }
        setHintFor(null);
        navigate(route.to, route.kind === 'check' ? { state: { check } } : undefined);
    }

    return (
        <div>
            <form onSubmit={handleSubmit} role="search" aria-busy={checking} className="relative">
                <Input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Wort oder Verbindung"
                    aria-label="Wort suchen oder Verbindung prüfen"
                    aria-describedby={showHint ? HINT_ID : undefined}
                    enterKeyHint="search"
                    autoComplete="off"
                    className="h-11 md:h-8 pr-12 md:pr-10 md:text-base shadow-sm"
                />
                <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 md:h-8 md:w-8 text-muted-foreground hover:text-foreground"
                    aria-label='Suchen'>

                    {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
            </form>
            {/* Always in the DOM, so screen readers announce the hint when it appears. */}
            <div aria-live="polite">
                {showHint && (
                    <p id={HINT_ID} className="mt-2 text-sm text-muted-foreground leading-snug">
                        <UnparsedCheckHint />
                    </p>
                )}
            </div>
        </div>
    );
}

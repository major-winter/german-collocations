import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { CollocationCheck } from '@collocations/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoaderCircle, Search } from 'lucide-react';
import { isPhraseQuery, searchRoute, showsSearchHint } from '@/lib/collocationCheck.ts';
import { createSuggester, moveActive, suggestionAnnouncement, type SuggestionRow } from '@/lib/suggest.ts';
import { cn } from '@/lib/utils';
import { fetchCheck } from '../api/check.ts';
import { fetchSuggest } from '../api/suggest.ts';
import { API_BASE_URL } from '../config.ts';
import { UnparsedCheckHint } from './UnparsedCheckHint.tsx';

interface SearchBoxProps {
    /** The page's word, or the check in the URL (#77); already decoded. */
    initialValue: string;
}

const HINT_ID = 'search-check-hint';
const LIST_ID = 'search-suggestions';
const MIN_LIST_HEIGHT = 144; // three rows, even when the keyboard leaves little room

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

    // Decision #88: suggestions as you type. The field stays one plain field:
    // `active` -1 means "no row chosen", and Enter then submits the typed text.
    const [rows, setRows] = useState<SuggestionRow[]>([]);
    const [open, setOpen] = useState(false); // the learner has typed and not dismissed the list
    const [active, setActive] = useState(-1);
    const [announcement, setAnnouncement] = useState('');
    const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
    const [suggester] = useState(() =>
        createSuggester({
            load: (q, signal) => fetchSuggest(API_BASE_URL, q, signal),
            onRows: (found, query) => {
                setRows(found);
                setActive(-1);
                setAnnouncement(query ? suggestionAnnouncement(found.length) : '');
            },
        }),
    );
    const listShown = open && rows.length > 0;
    useEffect(() => () => suggester.cancel(), [suggester]);

    // Keep the list inside what the on-screen keyboard leaves visible.
    useEffect(() => {
        if (!listShown) return;
        const vv = window.visualViewport;
        function fit() {
            const top = document.getElementById(LIST_ID)?.parentElement?.getBoundingClientRect().top;
            if (top === undefined) return;
            const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
            setMaxHeight(Math.max(MIN_LIST_HEIGHT, Math.floor(bottom - top - 8)));
        }
        fit();
        vv?.addEventListener('resize', fit);
        vv?.addEventListener('scroll', fit);
        return () => {
            vv?.removeEventListener('resize', fit);
            vv?.removeEventListener('scroll', fit);
        };
    }, [listShown]);

    useEffect(() => {
        if (active >= 0) document.getElementById(rows[active]?.id)?.scrollIntoView({ block: 'nearest' });
    }, [active, rows]);

    function closeList() {
        suggester.cancel();
        setOpen(false);
        setActive(-1);
        setAnnouncement('');
    }

    function choose(row: SuggestionRow) {
        closeList();
        setHintFor(null);
        setValue(row.lemma);
        navigate(row.to);
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.nativeEvent.isComposing) return;
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length > 0) {
            e.preventDefault(); // no caret jump to the ends of the text
            if (!listShown) setAnnouncement(suggestionAnnouncement(rows.length));
            setOpen(true);
            setActive(moveActive(listShown ? active : -1, e.key, rows.length));
        } else if (e.key === 'Enter' && listShown && active >= 0) {
            e.preventDefault(); // a chosen row wins; otherwise the form submits the text as before
            choose(rows[active]);
        } else if (e.key === 'Escape' && listShown) {
            e.preventDefault();
            closeList();
        }
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        closeList();
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
        <div className="sm:relative">
            <form onSubmit={handleSubmit} role="search" aria-busy={checking} className="relative">
                <Input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setOpen(true);
                        suggester.input(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    onBlur={closeList}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={listShown}
                    aria-controls={listShown ? LIST_ID : undefined}
                    aria-activedescendant={listShown && active >= 0 ? rows[active]?.id : undefined}
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
            {listShown && (
                <div
                    className="absolute z-50 inset-x-3 top-full mt-1 sm:inset-x-0 sm:mt-1.5 flex flex-col rounded-xl border bg-popover text-popover-foreground shadow-lg p-1.5"
                    style={{ maxHeight }}
                    // Keep focus in the field when a row is pressed, or blur would close the list first.
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <ul
                        id={LIST_ID}
                        role="listbox"
                        aria-label="Vorschläge"
                        className="min-h-0 overflow-y-auto"
                    >
                        {rows.map((row, i) => (
                            <li
                                key={row.id}
                                id={row.id}
                                role="option"
                                aria-selected={i === active}
                                onClick={() => choose(row)}
                                className={cn(
                                    'flex min-h-12 cursor-pointer items-center gap-2 rounded-lg px-3 text-base hover:bg-muted',
                                    i === active && 'bg-muted outline-2 -outline-offset-2 outline-ring',
                                )}
                            >
                                <span className="min-w-0 truncate">
                                    {row.article && <span className="text-pos-other">{row.article} </span>}
                                    <b className="font-semibold">{row.head}</b>
                                    {row.tail}
                                </span>
                                {row.classLabel && (
                                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-pos-other">
                                        {row.dot && <span aria-hidden="true" className={cn('size-2 rounded-full', row.dot)} />}
                                        {row.classLabel}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {/* Not in the listbox (its children are options). Spoken once by the placeholder, so hidden here. */}
                    <p aria-hidden="true" className="mt-1 shrink-0 border-t px-3 pb-1 pt-2 text-xs text-muted-foreground">
                        Oder eine ganze Verbindung eingeben, z. B. „eine Entscheidung treffen“
                    </p>
                </div>
            )}
            <div role="status" className="sr-only">{announcement}</div>
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

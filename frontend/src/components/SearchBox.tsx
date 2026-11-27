import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LoaderCircle, Search } from 'lucide-react';
import { checkTarget, isPhraseQuery } from '@/lib/collocationCheck.ts';
import { fetchCheck } from '../api/check.ts';
import { API_BASE_URL } from '../config.ts';

interface SearchBoxProps {
    /** The page's word, or the check in the URL (#77); already decoded. */
    initialValue: string;
}

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
    const navigate = useNavigate();

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed || checking) return;
        // Decision #70: a phrase like "eine Entscheidung machen" opens its noun
        // page with the check; anything else (or a failed check) searches as before.
        // #77: the check rides along in the navigation state, so the card
        // does not fetch it a second time.
        if (isPhraseQuery(trimmed)) {
            setChecking(true);
            const check = await fetchCheck(API_BASE_URL, trimmed).catch(() => null);
            setChecking(false);
            const target = check && checkTarget(check);
            if (target) {
                navigate(target, { state: { check } });
                return;
            }
        }
        navigate(`/wort/${encodeURIComponent(trimmed)}`);
    }

    return (
        <form onSubmit={handleSubmit} role="search" aria-busy={checking} className="relative">
            <Input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Wort oder Verbindung"
                aria-label="Wort suchen oder Verbindung prüfen"
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
    );
}

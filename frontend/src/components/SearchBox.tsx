import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { checkTarget, isPhraseQuery } from '@/lib/collocationCheck.ts';
import { fetchCheck } from '../api/check.ts';
import { API_BASE_URL } from '../config.ts';

interface SearchBoxProps {
    initialValue: string;
}

export function SearchBox({ initialValue }: SearchBoxProps) {
    const [value, setValue] = useState(initialValue);
    const navigate = useNavigate();

    useEffect(() => {
        setValue(decodeURIComponent(initialValue));
    }, [initialValue])

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        // Decision #70: a phrase like "eine Entscheidung machen" opens its noun
        // page with the check; anything else (or a failed check) searches as before.
        if (isPhraseQuery(trimmed)) {
            const target = await fetchCheck(API_BASE_URL, trimmed).then(checkTarget, () => null);
            if (target) {
                navigate(target);
                return;
            }
        }
        navigate(`/wort/${encodeURIComponent(trimmed)}`);
    }

    return (
        <form onSubmit={handleSubmit} role="search" className="relative">
            <Input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Geben Sie ein Wort ein…"
                aria-label="Wort suchen"
                className="h-11 md:h-8 pr-12 md:pr-10 md:text-base shadow-sm"
            />
            <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 md:h-8 md:w-8 text-muted-foreground hover:text-foreground"
                aria-label='Suchen'>

                <Search className="h-4 w-4" />
            </Button>
        </form>
    );
}

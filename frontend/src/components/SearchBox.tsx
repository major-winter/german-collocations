import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface SearchBoxProps {
    initialValue: string;
}

export function SearchBox({ initialValue }: SearchBoxProps) {
    const [value, setValue] = useState(initialValue);
    const navigate = useNavigate();

    useEffect(() => {
        setValue(decodeURIComponent(initialValue));
    }, [initialValue])

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        navigate(`/wort/${encodeURIComponent(trimmed)}`);
    }

    return (
        <form onSubmit={handleSubmit} role="search" className="relative">
            <Input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Geben Sie ein Wort ein…"
                aria-label="Search word"
                className="pr-10 bg-white dark:bg-white border-transparent shadow-sm text-slate-900 placeholder:text-slate-500"
            />
            <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-blue-900 hover:bg-blue-50 hover:text-blue-900"
                aria-label='Search'>

                <Search className="h-4 w-4" />
            </Button>
        </form>
    );
}

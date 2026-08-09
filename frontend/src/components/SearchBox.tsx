import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

interface SearchBoxProps {
    initialValue: string;
}

export function SearchBox({ initialValue }: SearchBoxProps) {
    const [value, setValue] = useState(initialValue);
    const navigate = useNavigate();

    function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        navigate(`/wort/${encodeURIComponent(trimmed)}`);
    }

    return (
        <form onSubmit={handleSubmit} role="search">
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Gibt eine Wort ein..."
                aria-label="Search word"
            />
            <button type="submit">Search</button>
        </form>
    );
}

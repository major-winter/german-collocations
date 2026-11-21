// PROTOTYPE - throwaway. Floating bar for flipping between the colour
// variants in colourVariants.css; dev builds only (see Layout).
import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import './colourVariants.css';

const VARIANTS = [
    { key: 'A', name: 'Today' },
    { key: 'B', name: 'Deeper colours' },
    { key: 'C', name: 'Quiet chips' },
    { key: 'D', name: 'Tinted pills' },
];

export function PrototypeSwitcher() {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const currentKey = searchParams.get('variant') ?? 'A';
    const currentIndex = Math.max(0, VARIANTS.findIndex((variant) => variant.key === currentKey));

    useEffect(() => {
        document.documentElement.dataset.variant = VARIANTS[currentIndex].key;
    }, [currentIndex]);

    function go(step: number) {
        const nextIndex = (currentIndex + step + VARIANTS.length) % VARIANTS.length;
        navigate(`${location.pathname}?variant=${VARIANTS[nextIndex].key}`, { replace: true });
    }

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            const target = event.target as HTMLElement;
            if (target.closest('input, textarea, [contenteditable]')) return;
            if (event.key === 'ArrowLeft') go(-1);
            if (event.key === 'ArrowRight') go(1);
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-fuchsia-700 text-white px-4 py-2 text-sm shadow-lg">
            <button type="button" onClick={() => go(-1)} aria-label="Previous variant">←</button>
            <span>{VARIANTS[currentIndex].key} ({VARIANTS[currentIndex].name})</span>
            <button type="button" onClick={() => go(1)} aria-label="Next variant">→</button>
        </div>
    );
}

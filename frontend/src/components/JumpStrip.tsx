import { useEffect, useRef, useState } from 'react';
import { headingId, type JumpGroup } from '@/lib/jumpGroups.ts';

/**
 * Sprungleiste: one row of pills, one per group card on the page, each with
 * its chip count. It replaces the colour legend (#63): since #86 every card
 * names and colours itself, so the strip's job is navigation, and its pills
 * keep the class colour. Buttons, not hash links: the router owns the URL.
 * Hidden when the page has only one group.
 */
export function JumpStrip({ groups }: { groups: JumpGroup[] }) {
    const scroller = useRef<HTMLUListElement>(null);
    // The fade at the right edge only shows while more pills wait off screen.
    const [moreRight, setMoreRight] = useState(false);

    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const update = () => setMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
        update();
        el.addEventListener('scroll', update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => {
            el.removeEventListener('scroll', update);
            observer.disconnect();
        };
    }, [groups]);

    if (groups.length < 2) return null;

    function jump(group: JumpGroup) {
        const card = document.getElementById(group.id);
        if (!card) return;
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        // The heading takes focus, so a screen reader reads where it landed
        // and the next Tab enters the group's chips.
        document.getElementById(headingId(group.id))?.focus({ preventScroll: true });
    }

    return (
        <nav aria-label="Springen zu" className="mt-3 mb-4">
            <ul
                ref={scroller}
                className="jump-strip -mx-4 flex list-none gap-2 overflow-x-auto px-4 py-0 m-0"
                data-more-right={moreRight || undefined}
            >
                {groups.map((group) => (
                    <li key={group.id} className="shrink-0">
                        <button
                            type="button"
                            data-pos={group.pos}
                            onClick={() => jump(group)}
                            className="jump-pill"
                        >
                            <span aria-hidden="true" className="jump-pill-dot" />
                            {group.label}
                            <span className="jump-pill-count">{group.count}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

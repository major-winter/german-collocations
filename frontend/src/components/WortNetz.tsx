// Decision #85: the app's name, drawn. A static word web for the home page
// (Rolle in the middle, its partners in their word-class colours) and a
// dashed thread for the not-found page. Decorative, so the web carries one
// text alternative and nothing in it is tabbable. Static data only: the
// partners are the sample's own words (lib/homeSample.ts).

interface Node {
    word: string;
    x: number;
    y: number;
    w: number;
    cls: 'v' | 'a' | 'p';
    d: string; // the thread from the centre (160, 75) to the node
}

const NODES: Node[] = [
    { word: 'spielen', x: 62, y: 26, w: 84, cls: 'v', d: 'M160 75 Q110 30 62 26' },
    { word: 'übernehmen', x: 266, y: 27, w: 106, cls: 'v', d: 'M160 75 Q215 35 266 27' },
    { word: 'wichtig', x: 46, y: 119, w: 76, cls: 'a', d: 'M160 75 Q95 105 46 119' },
    { word: 'entscheidend', x: 268, y: 119, w: 112, cls: 'a', d: 'M160 75 Q225 100 268 119' },
    { word: 'für', x: 160, y: 134, w: 50, cls: 'p', d: 'M160 75 L160 134' },
];

export function WortNetz() {
    const label = `Das Wort Rolle mit seinen Partnern ${NODES.map((n) => n.word).join(', ')}`;
    return (
        <svg viewBox="0 0 328 150" role="img" aria-label={label} className="wortnetz mx-auto block h-auto w-full max-w-[17.5rem] overflow-visible font-serif md:max-w-sm">
            {NODES.map((n) => (
                <path key={n.word} className={`wn-line wn-${n.cls}`} d={n.d} pathLength={1} />
            ))}
            {NODES.map((n, i) => (
                <g key={n.word} className={`wn-node wn-${n.cls}`} style={{ animationDelay: `${0.5 + i * 0.08}s` }}>
                    <rect x={n.x - n.w / 2} y={n.y - 13} width={n.w} height={26} rx={13} />
                    <text x={n.x} y={n.y}>{n.word}</text>
                </g>
            ))}
            <g className="wn-hub wn-n">
                <rect x={112} y={57} width={96} height={36} rx={18} />
                <text x={160} y={75}>Rolle</text>
            </g>
        </svg>
    );
}

/** The not-found page: the searched word, a dashed thread, and a "?" where a partner would be. */
export function LoseFaden({ word }: { word: string }) {
    return (
        <div aria-hidden="true" className="flex items-center font-serif text-sm text-muted-foreground">
            <span className="min-w-0 max-w-[60%] truncate rounded-full border border-pos-noun px-3 py-1">{word}</span>
            <span className="h-0 w-10 shrink-0 border-t-2 border-dashed border-muted-foreground/70 sm:w-14" />
            <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-dashed border-muted-foreground/70 text-lg">?</span>
        </div>
    );
}

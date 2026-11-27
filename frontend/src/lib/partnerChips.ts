// Decision #83 (B2 of the 2026-11-27 UI review): every partner group is a
// chip row with one open entry, as the verb pairs have been since #60.

export type OpenGroups<K extends string> = Record<K, number | null>;

/** No chip open, except the first group's first chip when the page has nothing else open. */
export function initialOpenGroups<K extends string>(groups: K[], openFirst: boolean): OpenGroups<K> {
    const open = {} as OpenGroups<K>;
    groups.forEach((g, i) => {
        open[g] = openFirst && i === 0 ? 0 : null;
    });
    return open;
}

/** One open chip per group; tapping the open chip keeps it open. */
export function openGroupChip<K extends string>(open: OpenGroups<K>, group: K, chipIndex: number): OpenGroups<K> {
    return { ...open, [group]: chipIndex };
}

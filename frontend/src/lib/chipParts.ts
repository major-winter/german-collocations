export interface ChipPart {
    text: string;
    muted: boolean;
}

/**
 * Decision #69: a verb-page chip like "sich die Frage" shows its article
 * muted. Splits the chip at the first whole-word occurrence of the
 * article the backend says is in it; no article, one plain part.
 */
export function chipParts(chip: string, article: string | null): ChipPart[] {
    if (!article) return [{ text: chip, muted: false }];
    const index = chip.split(' ').indexOf(article);
    if (index === -1) return [{ text: chip, muted: false }];

    const words = chip.split(' ');
    const before = words.slice(0, index).join(' ');
    const after = words.slice(index + 1).join(' ');
    return [
        ...(before ? [{ text: `${before} `, muted: false }] : []),
        { text: article, muted: true },
        ...(after ? [{ text: ` ${after}`, muted: false }] : []),
    ];
}

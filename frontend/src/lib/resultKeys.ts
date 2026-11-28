// The word page renders VerbNounPairs and CollocationList side by side, each
// keyed by the word so its open-chip state resets for a new word. Siblings
// must not share a key, so each block gets its own.
export function resultKeys(word: string): { pairs: string; list: string } {
    return { pairs: `${word}:pairs`, list: `${word}:list` };
}

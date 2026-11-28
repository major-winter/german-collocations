// Arrival of a lookup (Ankunft): what the polite live region says when a
// word page finishes loading, and when focus may move to the headword.

export type ArrivalState =
    | { status: 'ok'; word: string; groups: number }
    | { status: 'notFound'; word: string; suggestions: number }
    | { status: 'error' };

export function arrivalAnnouncement(state: ArrivalState): string {
    switch (state.status) {
        case 'ok':
            if (state.groups === 0) return `${state.word}: keine Partner gefunden`;
            return `${state.word}: ${state.groups} ${state.groups === 1 ? 'Gruppe' : 'Gruppen'} mit Partnern`;
        case 'notFound': {
            const n = state.suggestions;
            const tail = n === 0 ? 'keine Vorschläge' : `${n} ${n === 1 ? 'Vorschlag' : 'Vorschläge'}`;
            return `Keine Ergebnisse für ${state.word}, ${tail}`;
        }
        case 'error':
            return ''; // the error's role="alert" already speaks
    }
}

/**
 * Focus follows a navigation the learner started (search, link click). A
 * POP is back/forward or the first load: the browser or the learner already
 * decided where they are, so stealing focus there would be hostile.
 */
export function movesFocusOnArrival(navigationType: 'POP' | 'PUSH' | 'REPLACE'): boolean {
    return navigationType !== 'POP';
}

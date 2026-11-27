// Decisions #75, #78: what a learner sees for a phrase the check cannot
// read, on the card (a phrase in the URL) and under the header search box
// (a phrase just typed). One wording for both.
export function UnparsedCheckHint() {
    return (
        <>
            Das können wir nicht prüfen. Geben Sie ein Nomen mit Verb oder Adjektiv ein, z. B.{' '}
            <i>Entscheidung treffen</i>, <i>starker Regen</i> oder <i>an einer Sitzung teilnehmen</i>.
        </>
    );
}

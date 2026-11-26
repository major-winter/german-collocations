import { LegalPage, OperatorAddress } from '@/components/LegalPage.tsx';
import { OPERATOR } from '@/lib/impressum.ts';

// Impressum (§5 DDG), decision #72. The details are build-time variables.

export function Impressum() {
    return (
        <LegalPage title="Impressum">
            <section>
                <h3>Angaben gemäß § 5 DDG</h3>
                <OperatorAddress />
            </section>
            <section>
                <h3>Verantwortlich für den Inhalt</h3>
                <p>{OPERATOR.name}, Anschrift wie oben.</p>
            </section>
            <section>
                <h3>Daten</h3>
                <p>
                    Die Beispielsätze und Häufigkeiten stammen aus der Leipzig Corpora Collection (Universität
                    Leipzig). Die Verbindungen werden automatisch ermittelt und können Fehler enthalten.
                </p>
            </section>
        </LegalPage>
    );
}

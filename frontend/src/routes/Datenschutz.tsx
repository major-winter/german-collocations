import { Link } from 'react-router';
import { LegalPage, OperatorAddress } from '@/components/LegalPage.tsx';

// Datenschutzerklärung, decision #72. Describes what is true today: no
// cookies, no browser storage, no third-party requests, no access logs,
// anonymous per-day counts. Phase A1 (#71) extends it when it ships.

export function Datenschutz() {
    return (
        <LegalPage title="Datenschutz">
            <section>
                <h3>Verantwortlich</h3>
                <OperatorAddress />
            </section>

            <section>
                <h3>Kurz gesagt</h3>
                <p>
                    Wortnetz setzt keine Cookies, speichert nichts in Ihrem Browser, lädt keine Inhalte von
                    Dritten (keine externen Schriften, Skripte oder Werbung) und führt kein Zugriffsprotokoll.
                    Wir speichern keine IP-Adressen und nichts, was Sie als Person erkennbar macht.
                </p>
            </section>

            <section>
                <h3>Was beim Aufruf passiert</h3>
                <p>
                    Wenn Sie ein Wort suchen oder eine Verbindung prüfen, schickt Ihr Browser die Eingabe an
                    unseren Server, damit er antworten kann. Dabei wird technisch bedingt Ihre IP-Adresse
                    übertragen. Sie wird nur für die Dauer der Anfrage verwendet und nicht gespeichert. Ihre
                    Eingaben werden ebenfalls nicht gespeichert.
                </p>
            </section>

            <section>
                <h3>Anonyme Nutzungszahlen</h3>
                <p>
                    Um zu sehen, wie viel Wortnetz genutzt wird, zählt der Server pro Tag, wie oft eine
                    Wortseite aufgerufen und wie oft eine Verbindung geprüft wurde. Gespeichert werden nur das
                    Datum, die Art des Aufrufs und eine Zahl – kein Wort, das Sie gesucht haben, keine
                    IP-Adresse, keine Kennung. Diese Zahlen lassen sich keiner Person zuordnen. Dazu wird
                    nichts aus Ihrem Browser ausgelesen.
                </p>
            </section>

            <section>
                <h3>Hosting</h3>
                <p>
                    Der Server wird bei Akamai Technologies (Linode) in einem Rechenzentrum in Singapur
                    betrieben. Akamai verarbeitet die Verbindungsdaten nur, um die Seite auszuliefern.
                    Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und funktionierenden
                    Angebot (Art. 6 Abs. 1 lit. f DSGVO). Singapur liegt außerhalb der EU, und für Singapur
                    gibt es keinen Angemessenheitsbeschluss der EU-Kommission. Die Übermittlung ist durch
                    die Standardvertragsklauseln der EU-Kommission abgesichert, die Teil des
                    Auftragsverarbeitungsvertrags mit Akamai sind (Art. 46 Abs. 2 lit. c DSGVO).
                </p>
            </section>

            <section>
                <h3>Ihre Rechte</h3>
                <p>
                    Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und
                    Widerspruch (Art. 15–21 DSGVO). Da wir keine personenbezogenen Daten speichern, gibt es in
                    der Regel nichts zu beauskunften – fragen Sie trotzdem gern per E-Mail. Sie können sich
                    außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), insbesondere in
                    dem Land, in dem Sie wohnen.
                </p>
            </section>

            <p className="text-muted-foreground">
                Siehe auch das <Link to="/impressum">Impressum</Link>.
            </p>
        </LegalPage>
    );
}

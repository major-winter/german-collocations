import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalAnnouncement, movesFocusOnArrival } from './arrival.ts';

test('a finished lookup says how many groups of partners the page has', () => {
    assert.equal(arrivalAnnouncement({ status: 'ok', word: 'Frage', groups: 6 }), 'Frage: 6 Gruppen mit Partnern');
});

test('one group is singular', () => {
    assert.equal(arrivalAnnouncement({ status: 'ok', word: 'Frage', groups: 1 }), 'Frage: 1 Gruppe mit Partnern');
});

test('a page without groups says so instead of "0 Gruppen"', () => {
    assert.equal(arrivalAnnouncement({ status: 'ok', word: 'Frage', groups: 0 }), 'Frage: keine Partner gefunden');
});

test('not-found counts the suggestions', () => {
    assert.equal(
        arrivalAnnouncement({ status: 'notFound', word: 'Fraqe', suggestions: 4 }),
        'Keine Ergebnisse für Fraqe, 4 Vorschläge',
    );
    assert.equal(
        arrivalAnnouncement({ status: 'notFound', word: 'Fraqe', suggestions: 1 }),
        'Keine Ergebnisse für Fraqe, 1 Vorschlag',
    );
    assert.equal(
        arrivalAnnouncement({ status: 'notFound', word: 'Fraqe', suggestions: 0 }),
        'Keine Ergebnisse für Fraqe, keine Vorschläge',
    );
});

test('an error is announced by its own alert, so the live region stays silent', () => {
    assert.equal(arrivalAnnouncement({ status: 'error' }), '');
});

test('focus moves for a navigation the learner started, not for back/forward or the first load', () => {
    assert.equal(movesFocusOnArrival('PUSH'), true);
    assert.equal(movesFocusOnArrival('REPLACE'), true);
    assert.equal(movesFocusOnArrival('POP'), false);
});

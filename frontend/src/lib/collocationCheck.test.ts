import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollocationCheck } from '@collocations/types';
import { checkMatchesPage, checkTarget, isPhraseQuery, phraseParts, verdictLabel } from './collocationCheck.ts';

const entscheidung: CollocationCheck = {
    parsed: true,
    phrase: 'eine Entscheidung machen',
    noun: 'Entscheidung',
    verbTyped: 'machen',
    verb: 'machen',
    relation: 'obj',
    verdict: 'unusual',
    matched: null,
    suggestions: [],
};

test('isPhraseQuery is two or more words', () => {
    assert.equal(isPhraseQuery('Entscheidung'), false);
    assert.equal(isPhraseQuery(' eine Entscheidung machen '), true);
});

test('checkTarget opens the noun page with the check in the URL', () => {
    assert.equal(checkTarget({ parsed: false }), null);
    assert.equal(checkTarget(entscheidung), '/wort/Entscheidung?pruefen=eine%20Entscheidung%20machen');
});

test('checkMatchesPage only for the page\'s own noun', () => {
    assert.equal(checkMatchesPage(entscheidung, 'Entscheidungen', 'Entscheidung'), true);
    assert.equal(checkMatchesPage({ ...entscheidung, noun: 'Frage' }, 'Entscheidung', 'Entscheidung'), false);
    assert.equal(checkMatchesPage({ parsed: false }, 'Entscheidung', 'Entscheidung'), false);
});

test('verdictLabel uses the spec\'s German labels', () => {
    assert.equal(verdictLabel('usual'), 'Üblich ✓');
    assert.equal(verdictLabel('unusual'), 'Nicht typisch');
    assert.equal(verdictLabel('noData'), 'Keine Daten');
});

test('phraseParts marks the noun and the verb as whole words', () => {
    assert.deepEqual(phraseParts({ phrase: 'sich Mühe geben', nounWord: 'Mühe', verbWord: 'geben' }), [
        { text: 'sich ', kind: 'plain' },
        { text: 'Mühe', kind: 'noun' },
        { text: ' ', kind: 'plain' },
        { text: 'geben', kind: 'verb' },
    ]);
    assert.deepEqual(phraseParts({ phrase: 'Entscheidungen treffen', nounWord: 'Entscheidung', verbWord: 'treffen' }), [
        { text: 'Entscheidungen ', kind: 'plain' },
        { text: 'treffen', kind: 'verb' },
    ]);
});

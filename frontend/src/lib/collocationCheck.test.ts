import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollocationCheck } from '@collocations/types';
import {
    checkMatchesPage,
    checkHintExample,
    checkTarget,
    isPhraseQuery,
    partnerKind,
    partnerTyped,
    phraseParts,
    preloadedCheck,
    historyStateWithoutCheck,
    searchFieldValue,
    unusualReason,
    verdictLabel,
} from './collocationCheck.ts';

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

const regen: CollocationCheck = {
    parsed: true,
    phrase: 'schwerer Regen',
    noun: 'Regen',
    adjectiveTyped: 'schwerer',
    adjective: 'schwer',
    relation: 'amod',
    verdict: 'unusual',
    matched: null,
    suggestions: [],
};

test('isPhraseQuery is two or more words', () => {
    assert.equal(isPhraseQuery('Entscheidung'), false);
    assert.equal(isPhraseQuery(' eine Entscheidung machen '), true);
});

test('searchFieldValue shows the check in the URL, else the page word (#77)', () => {
    assert.equal(searchFieldValue('Sitzung', 'bei einer  Sitzung teilnehmen '), 'bei einer Sitzung teilnehmen');
    assert.equal(searchFieldValue('Sitzung', null), 'Sitzung');
    assert.equal(searchFieldValue('Sitzung', '  '), 'Sitzung');
    assert.equal(searchFieldValue('', null), '');
});

test('searchFieldValue decodes the page word, and keeps a malformed one as is', () => {
    assert.equal(searchFieldValue('Gr%C3%B6%C3%9Fe', null), 'Größe');
    assert.equal(searchFieldValue('100%', null), '100%');
});

test('preloadedCheck reuses the search box\'s check for the same phrase and page (#77)', () => {
    const state = { check: entscheidung };
    assert.equal(preloadedCheck(state, 'eine Entscheidung machen', 'Entscheidung', 'Entscheidung'), entscheidung);
    assert.equal(preloadedCheck(state, 'eine Entscheidung treffen', 'Entscheidung', 'Entscheidung'), null);
    assert.equal(preloadedCheck(state, 'eine Entscheidung machen', 'Frage', 'Frage'), null);
    assert.equal(preloadedCheck({ check: { parsed: false } }, 'x y', 'Entscheidung', 'Entscheidung'), null);
    assert.equal(preloadedCheck(null, 'eine Entscheidung machen', 'Entscheidung', 'Entscheidung'), null);
    assert.equal(preloadedCheck('junk', 'eine Entscheidung machen', 'Entscheidung', 'Entscheidung'), null);
});

test('checkHintExample is the noun\'s best object pair, else its best prepositional pair', () => {
    const pair = (relation: 'obj' | 'obl' | 'nsubj', phrase: string) => ({ relation, phrase });
    assert.equal(
        checkHintExample([pair('nsubj', 'die Sitzung beginnt'), pair('obj', 'die Sitzung leiten'), pair('obl', 'an der Sitzung teilnehmen')]),
        'die Sitzung leiten',
    );
    assert.equal(checkHintExample([pair('nsubj', 'die Sitzung beginnt'), pair('obl', 'an der Sitzung teilnehmen')]), 'an der Sitzung teilnehmen');
    assert.equal(checkHintExample([pair('nsubj', 'die Sitzung beginnt')]), null);
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
    assert.deepEqual(phraseParts({ phrase: 'sich Mühe geben', nounWord: 'Mühe', partnerWord: 'geben' }, 'verb'), [
        { text: 'sich ', kind: 'plain' },
        { text: 'Mühe', kind: 'noun' },
        { text: ' ', kind: 'plain' },
        { text: 'geben', kind: 'verb' },
    ]);
    assert.deepEqual(phraseParts({ phrase: 'Entscheidungen treffen', nounWord: 'Entscheidung', partnerWord: 'treffen' }, 'verb'), [
        { text: 'Entscheidungen ', kind: 'plain' },
        { text: 'treffen', kind: 'verb' },
    ]);
});

test('phraseParts colours an adjective partner as an adjective (#74)', () => {
    assert.deepEqual(phraseParts({ phrase: 'starker Regen', nounWord: 'Regen', partnerWord: 'starker' }, 'adjective'), [
        { text: 'starker', kind: 'adjective' },
        { text: ' ', kind: 'plain' },
        { text: 'Regen', kind: 'noun' },
    ]);
});

test('partnerKind and partnerTyped follow the relation', () => {
    assert.equal(partnerKind(entscheidung), 'verb');
    assert.equal(partnerKind(regen), 'adjective');
    assert.equal(partnerTyped(entscheidung), 'machen');
    assert.equal(partnerTyped(regen), 'schwerer');
    assert.equal(checkTarget(regen), '/wort/Regen?pruefen=schwerer%20Regen');
});

const sitzung: Extract<CollocationCheck, { relation: 'obl' }> = {
    parsed: true,
    phrase: 'an einer Sitzung teilnehmen',
    noun: 'Sitzung',
    verbTyped: 'teilnehmen',
    verb: 'teilnehmen',
    prepositionTyped: 'an',
    preposition: 'an',
    relation: 'obl',
    verdict: 'unusual',
    otherPreposition: true,
    matched: null,
    suggestions: [],
};

test('a prepositional check has a verb partner, typed as the verb (#76)', () => {
    assert.equal(partnerKind(sitzung), 'verb');
    assert.equal(partnerTyped(sitzung), 'teilnehmen');
    assert.equal(checkTarget(sitzung), '/wort/Sitzung?pruefen=an%20einer%20Sitzung%20teilnehmen');
});

test('unusualReason tells another preposition from another verb or adjective (#76)', () => {
    assert.equal(unusualReason(sitzung), 'preposition');
    assert.equal(unusualReason({ ...sitzung, otherPreposition: false }), 'verb');
    assert.equal(unusualReason(entscheidung), 'verb');
    assert.equal(unusualReason(regen), 'adjective');
});

test('historyStateWithoutCheck drops the passed check so a reload fetches again (#77)', () => {
    assert.deepEqual(historyStateWithoutCheck({ usr: { check: entscheidung }, key: 'k1', idx: 3 }), { usr: null, key: 'k1', idx: 3 });
    assert.deepEqual(historyStateWithoutCheck(null), { usr: null });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipParts } from './chipParts.ts';

test('mutes the article inside the chip (#69)', () => {
    assert.deepEqual(chipParts('sich die Frage', 'die'), [
        { text: 'sich ', muted: false },
        { text: 'die', muted: true },
        { text: ' Frage', muted: false },
    ]);
    assert.deepEqual(chipParts('die Frage', 'die'), [
        { text: 'die', muted: true },
        { text: ' Frage', muted: false },
    ]);
    assert.deepEqual(chipParts('die Information (sich)', 'die'), [
        { text: 'die', muted: true },
        { text: ' Information (sich)', muted: false },
    ]);
});

test('a chip without an article is one plain part', () => {
    assert.deepEqual(chipParts('Ahnung', null), [{ text: 'Ahnung', muted: false }]);
});

test('only a whole-word article is muted', () => {
    assert.deepEqual(chipParts('Diebe', 'die'), [{ text: 'Diebe', muted: false }]);
});

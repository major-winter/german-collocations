import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultKeys } from './resultKeys.ts';

test('the word page gives its sibling result blocks different keys (React duplicate-key warning)', () => {
    const keys = resultKeys('Entscheidung');
    assert.notEqual(keys.pairs, keys.list);
});

test('each key still changes with the word, so a new word starts with fresh state', () => {
    const a = resultKeys('Frage');
    const b = resultKeys('Sitzung');
    assert.notEqual(a.pairs, b.pairs);
    assert.notEqual(a.list, b.list);
});

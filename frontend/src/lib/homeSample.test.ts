import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_SAMPLE } from './homeSample.ts';

test('the home sample is a noun page for Rolle with one relation, obj', () => {
    assert.equal(HOME_SAMPLE.side, 'noun');
    assert.equal(HOME_SAMPLE.lemma, 'Rolle');
    assert.ok(HOME_SAMPLE.pairs.length >= 4);
    assert.ok(HOME_SAMPLE.pairs.every((pair) => pair.relation === 'obj'));
});

test('every sample pair opens to a sentence that contains both highlighted words', () => {
    for (const pair of HOME_SAMPLE.pairs) {
        assert.ok(pair.examples.length >= 1, pair.phrase);
        for (const example of pair.examples) {
            assert.ok(example.sentence.includes(example.searchWord), example.sentence);
            assert.ok(example.sentence.includes(example.collocateWord), example.sentence);
        }
    }
});

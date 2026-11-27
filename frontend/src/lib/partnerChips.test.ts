import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialOpenGroups, openGroupChip } from './partnerChips.ts';

test('initialOpenGroups opens the first chip of the first group only when asked (B2, #83)', () => {
    assert.deepEqual(initialOpenGroups(['adjective', 'noun'], true), { adjective: 0, noun: null });
    assert.deepEqual(initialOpenGroups(['adjective', 'noun'], false), { adjective: null, noun: null });
    assert.deepEqual(initialOpenGroups([], true), {});
});

test('openGroupChip opens one chip per group and leaves the others', () => {
    const open = { adjective: 0, noun: null };
    assert.deepEqual(openGroupChip(open, 'noun', 2), { adjective: 0, noun: 2 });
    assert.deepEqual(openGroupChip(open, 'adjective', 0), { adjective: 0, noun: null }); // tapping the open chip keeps it open
});

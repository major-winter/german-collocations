import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollocationResponse, VerbNounPair, VerbNounRelation } from '@collocations/types';
import { groupHeadings, groupPairs, hasAnyResults, headingParts, initialOpen, wordColors } from './verbNounGroups.ts';

function pair(relation: VerbNounRelation, partner: string): VerbNounPair {
  return { relation, partner, chip: partner, phrase: partner, score: 1, frequency: 5, examples: [] };
}

test('noun page headings', () => {
  assert.deepEqual(groupHeadings('noun', 'Kritik'), {
    obj: 'Kritik + Verb',
    obl: 'Präposition + Kritik + Verb',
    nsubj: 'Kritik als Subjekt',
  });
});

test('verb page headings', () => {
  assert.deepEqual(groupHeadings('verb', 'üben'), {
    obj: 'Substantiv + üben',
    obl: 'Präposition + Substantiv + üben',
    nsubj: 'Substantiv als Subjekt',
  });
});

test('groupPairs orders obj, obl, nsubj and keeps the order inside a group', () => {
  const groups = groupPairs([pair('nsubj', 'kommen'), pair('obj', 'üben'), pair('obj', 'äußern')]);
  assert.deepEqual(
    groups.map((group) => [group.relation, group.pairs.map((item) => item.partner)]),
    [
      ['obj', ['üben', 'äußern']],
      ['nsubj', ['kommen']],
    ],
  );
});

test('initialOpen opens the first chip of the first group only', () => {
  const groups = groupPairs([pair('obl', 'stehen'), pair('nsubj', 'kommen')]);
  const open = initialOpen(groups);
  assert.equal(open.obl, 0);
  assert.equal(open.nsubj, null);
  assert.ok(open.obj === null || open.obj === undefined);
});

test('hasAnyResults counts lab pairs as results', () => {
  const empty: CollocationResponse = { word: 'x', collocations: [], governedPrepositions: [], verbNounPairs: null };
  assert.equal(hasAnyResults(empty), false);
  assert.equal(
    hasAnyResults({ ...empty, verbNounPairs: { side: 'noun', lemma: 'x', pairs: [pair('obj', 'üben')] } }),
    true,
  );
  assert.equal(hasAnyResults({ ...empty, verbNounPairs: { side: 'noun', lemma: 'x', pairs: [] } }), false);
});

test('nouns are blue on both pages, verbs orange', () => {
  assert.deepEqual(wordColors('noun'), {
    searched: 'font-semibold text-pos-noun',
    partner: 'text-pos-verb',
    chip: '',
  });
  assert.deepEqual(wordColors('verb'), {
    searched: 'font-semibold text-pos-verb',
    partner: 'text-pos-noun',
    chip: 'text-pos-noun',
  });
});

test('heading parts mark the noun, so it can be blue', () => {
  assert.deepEqual(headingParts('noun', 'Kritik').obl, [
    { text: 'Präposition + ', noun: false },
    { text: 'Kritik', noun: true },
    { text: ' + Verb', noun: false },
  ]);
  assert.deepEqual(headingParts('verb', 'üben').nsubj, [
    { text: 'Substantiv', noun: true },
    { text: ' als Subjekt', noun: false },
  ]);
});

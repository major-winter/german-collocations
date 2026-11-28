import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollocationEntry, CollocationResponse, CollocationSection, VerbNounPair, VerbNounRelation } from '@collocations/types';
import { jumpGroups, sectionGroupId, verbNounGroupId } from './jumpGroups.ts';

function pair(relation: VerbNounRelation): VerbNounPair {
  return {
    relation, partner: 'x', chip: 'x', chipArticle: null, phrase: 'x', phraseNoun: 'x',
    score: 1, frequency: 5, examples: [],
  };
}
function entry(section: CollocationSection): CollocationEntry {
  return { word: 'x', cooccurrence: 1, significance: 1, examples: [], section };
}
const page = (side: 'noun' | 'verb', pairs: VerbNounPair[], entries: CollocationEntry[]): CollocationResponse => ({
  word: 'x',
  collocations: entries,
  verbNounPairs: { side, lemma: 'x', article: null, pairs },
});

test('a noun page lists verb-noun groups first, then the word-class sections, as the page renders them', () => {
  const groups = jumpGroups(
    page('noun', [pair('obj'), pair('obj'), pair('obl'), pair('nsubj')], [
      entry('other'), entry('adjective'), entry('adjective'), entry('preposition'),
    ]),
  );
  assert.deepEqual(
    groups.map((g) => [g.id, g.label, g.pos, g.count]),
    [
      [verbNounGroupId('obj'), 'Verben', 'verb', 2],
      [verbNounGroupId('obl'), 'mit Präposition', 'verb', 1],
      [verbNounGroupId('nsubj'), 'als Subjekt', 'verb', 1],
      [sectionGroupId('adjective'), 'Adjektive', 'adjective', 2],
      [sectionGroupId('preposition'), 'Präpositionen', 'preposition', 1],
      [sectionGroupId('other'), 'Sonstige', 'other', 1],
    ],
  );
});

test('a verb page names its verb-noun partners Substantive', () => {
  const groups = jumpGroups(page('verb', [pair('obj'), pair('nsubj')], []));
  assert.deepEqual(groups.map((g) => [g.label, g.pos]), [['Substantive', 'noun'], ['als Subjekt', 'noun']]);
});

test('a page without lab pairs lists only the sections', () => {
  const groups = jumpGroups({ word: 'x', collocations: [entry('adjective')], verbNounPairs: null });
  assert.deepEqual(groups.map((g) => g.label), ['Adjektive']);
});

test('ids are distinct, so each can be a scroll target', () => {
  const ids = jumpGroups(page('noun', [pair('obj'), pair('obl'), pair('nsubj')], [entry('adjective'), entry('other')])).map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
});

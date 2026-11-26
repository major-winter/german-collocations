import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollocationEntry, CollocationResponse, CollocationSection } from '@collocations/types';
import { legendSections, WORD_CLASS_ORDER, wordClassStyle } from './wordClass.ts';

function entry(section: CollocationSection): CollocationEntry {
  return { word: 'x', cooccurrence: 1, significance: 1, examples: [], section };
}

const empty: CollocationResponse = { word: 'Kritik', collocations: [], verbNounPairs: null };

test('every word class but "other" has a text colour and a matching dot colour', () => {
  for (const wordClass of WORD_CLASS_ORDER) {
    const style = wordClassStyle(wordClass);
    if (wordClass === 'other') {
      assert.equal(style.dot, null);
      continue;
    }
    assert.equal(style.text, `text-pos-${wordClass}`);
    assert.equal(style.dot, `bg-pos-${wordClass}`);
  }
});

test('the legend lists the word classes the collocation list shows', () => {
  const response = { ...empty, collocations: [entry('adjective'), entry('other'), entry('adjective')] };
  assert.deepEqual([...legendSections(response)], ['adjective', 'other']);
});

test('lab pairs put noun and verb in the legend, even when the collocation list has neither', () => {
  const response: CollocationResponse = {
    ...empty,
    collocations: [entry('adjective')],
    verbNounPairs: {
      side: 'noun',
      lemma: 'Kritik',
      article: null,
      pairs: [{
        relation: 'obj', partner: 'üben', chip: 'üben', chipArticle: null, phrase: 'Kritik üben',
        phraseNoun: 'Kritik', score: 1, frequency: 1, examples: [],
      }],
    },
  };
  assert.deepEqual(new Set(legendSections(response)), new Set(['adjective', 'noun', 'verb']));
});

test('an empty lab result adds nothing to the legend', () => {
  const response: CollocationResponse = { ...empty, verbNounPairs: { side: 'noun', lemma: 'Kritik', pairs: [] } };
  assert.equal(legendSections(response).size, 0);
});

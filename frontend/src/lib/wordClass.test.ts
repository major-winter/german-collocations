import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partnerSection, WORD_CLASS_ORDER, wordClassStyle } from './wordClass.ts';

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

test('a verb-noun group takes the colour of its partners: verbs on a noun page, nouns on a verb page', () => {
  assert.equal(partnerSection('noun'), 'verb');
  assert.equal(partnerSection('verb'), 'noun');
});

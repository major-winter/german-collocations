import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipOf, lookupCandidates, pageSide, phraseOf } from './verbNounPhrases.ts';

test('pageSide maps the dominant part of speech to a page side', () => {
  assert.equal(pageSide('NOUN'), 'noun');
  assert.equal(pageSide('VERB'), 'verb');
  assert.equal(pageSide('AUX'), 'verb');
  assert.equal(pageSide('ADJ'), null);
  assert.equal(pageSide(null), null);
});

test('phraseOf writes the pair the way a learner would say it', () => {
  assert.equal(phraseOf('obj', 'üben', 'Kritik', 'Kritik'), 'Kritik üben');
  assert.equal(phraseOf('obj', 'sich geben', 'Mühe', 'Mühe'), 'sich Mühe geben');
  assert.equal(phraseOf('obl', 'stehen', 'in der Kritik', 'Kritik'), 'in der Kritik stehen');
  assert.equal(phraseOf('obl', 'sich üben', 'in Geduld', 'Geduld'), 'sich in Geduld üben');
  assert.equal(phraseOf('nsubj', 'sich richten', 'Kritik', 'Kritik'), 'Kritik … sich richten');
});

test('chipOf labels the partner, keeping the preposition on obl chips', () => {
  assert.equal(chipOf('noun', 'obl', 'stehen', 'in der Kritik', 'Kritik'), 'in der … stehen');
  assert.equal(chipOf('noun', 'obj', 'üben', 'Kritik', 'Kritik'), 'üben');
  assert.equal(chipOf('noun', 'nsubj', 'sich richten', 'Kritik', 'Kritik'), 'sich richten');
  assert.equal(chipOf('verb', 'obl', 'üben', 'in Geduld', 'Geduld'), 'in Geduld');
  assert.equal(chipOf('verb', 'nsubj', 'kommen', 'Kritik', 'Kritik'), 'Kritik');
  assert.equal(chipOf('verb', 'obj', 'üben', 'Kritik', 'Kritik'), 'Kritik');
});

test('prefers the searched word over the dominant lemma', () => {
  assert.deepEqual(lookupCandidates('Kritiken', 'Kritik'), ['Kritiken', 'Kritik']);
  assert.deepEqual(lookupCandidates('Kritik', 'Kritik'), ['Kritik']);
  assert.deepEqual(lookupCandidates('Kritik', null), ['Kritik']);
});

test('chipOf marks reflexive pairs on the verb page, so "Frage" and "sich Frage" differ', () => {
  assert.equal(chipOf('verb', 'obj', 'sich stellen', 'Frage', 'Frage'), 'sich Frage');
  assert.equal(chipOf('verb', 'obl', 'sich üben', 'in Geduld', 'Geduld'), 'sich in Geduld');
  assert.equal(chipOf('verb', 'nsubj', 'sich finden', 'Information', 'Information'), 'Information (sich)');
  assert.equal(chipOf('verb', 'obj', 'stellen', 'Frage', 'Frage'), 'Frage');
});

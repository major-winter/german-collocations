import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipOf, lookupCandidates, pageSide, phraseNounWord, phraseOf } from './verbNounPhrases.ts';

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
  assert.equal(chipOf('noun', 'obl', 'stehen', 'in der Kritik', 'Kritik', null), 'in der … stehen');
  assert.equal(chipOf('noun', 'obj', 'üben', 'Kritik', 'Kritik', null), 'üben');
  assert.equal(chipOf('noun', 'nsubj', 'sich richten', 'Kritik', 'Kritik', null), 'sich richten');
  assert.equal(chipOf('verb', 'obl', 'üben', 'in Geduld', 'Geduld', null), 'in Geduld');
  assert.equal(chipOf('verb', 'nsubj', 'kommen', 'Kritik', 'Kritik', null), 'Kritik');
  assert.equal(chipOf('verb', 'obj', 'üben', 'Kritik', 'Kritik', null), 'Kritik');
});

test('prefers the searched word over the dominant lemma', () => {
  assert.deepEqual(lookupCandidates('Kritiken', 'Kritik'), ['Kritiken', 'Kritik']);
  assert.deepEqual(lookupCandidates('Kritik', 'Kritik'), ['Kritik']);
  assert.deepEqual(lookupCandidates('Kritik', null), ['Kritik']);
});

test('chipOf marks reflexive pairs on the verb page, so "Frage" and "sich Frage" differ', () => {
  assert.equal(chipOf('verb', 'obj', 'sich stellen', 'Frage', 'Frage', null), 'sich Frage');
  assert.equal(chipOf('verb', 'obl', 'sich üben', 'in Geduld', 'Geduld', null), 'sich in Geduld');
  assert.equal(chipOf('verb', 'nsubj', 'sich finden', 'Information', 'Information', null), 'Information (sich)');
  assert.equal(chipOf('verb', 'obj', 'stellen', 'Frage', 'Frage', null), 'Frage');
});

test('chipOf puts the article before the noun on verb-page chips (#69)', () => {
  assert.equal(chipOf('verb', 'obj', 'stellen', 'Fragen', 'Frage', 'die'), 'die Frage');
  assert.equal(chipOf('verb', 'obj', 'sich stellen', 'Fragen', 'Frage', 'die'), 'sich die Frage');
  assert.equal(chipOf('verb', 'nsubj', 'sich richten', 'Information', 'Information', 'die'), 'die Information (sich)');
  assert.equal(chipOf('verb', 'obl', 'üben', 'in Geduld', 'Geduld', 'die'), 'in Geduld');
  assert.equal(chipOf('noun', 'obj', 'treffen', 'Entscheidungen', 'Entscheidung', 'die'), 'treffen');
});

test('chipOf leaves the chip alone without an article', () => {
  assert.equal(chipOf('verb', 'obj', 'haben', 'keine Ahnung', 'Ahnung', null), 'Ahnung');
});

test('phraseOf uses the written noun phrase for subjects (#69)', () => {
  assert.equal(phraseOf('nsubj', 'stattfinden', 'die Veranstaltung', 'Veranstaltung'), 'die Veranstaltung … stattfinden');
  assert.equal(phraseOf('obj', 'haben', 'keine Ahnung', 'Ahnung'), 'keine Ahnung haben');
});

test('phraseNounWord is the written noun', () => {
  assert.equal(phraseNounWord('Entscheidungen'), 'Entscheidungen');
  assert.equal(phraseNounWord('in der Kritik'), 'Kritik');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgePreposition, splitPrepositionalPhrase, type OblPair } from './prepositionCheck.ts';

const pair = (verb: string, prep: string, noun: string, score: number, phraseNoun = `${prep} ${noun}`): OblPair => ({
  verb,
  prep,
  noun,
  phraseNoun,
  score,
});

// Measured on the local lab data, 2026-11-27 (plan: prepositional check).
const sitzung = [
  pair('teilnehmen', 'an', 'Sitzung', 1201, 'an den Sitzungen'),
  pair('beschließen', 'in', 'Sitzung', 683, 'in seiner Sitzung'),
  pair('einladen', 'zu', 'Sitzung', 241, 'zu den Sitzungen'),
  pair('teilnehmen', 'bei', 'Sitzung', 12, 'bei der Sitzung'),
  pair('teilnehmen', 'mit', 'Sitzung', 5, 'mit der Sitzung'),
];
const einsatz = [
  pair('kommen', 'zu', 'Einsatz', 18761, 'zum Einsatz'),
  pair('kommen', 'auf', 'Einsatz', 569, 'auf Einsätze'),
  pair('kommen', 'in', 'Einsatz', 1, 'in Einsatz'),
];
const diskussion = [pair('sich beteiligen', 'an', 'Diskussion', 354, 'an der Diskussion')];
const besuch = [
  pair('sich freuen', 'auf', 'Besuch', 472, 'auf ihren Besuch'),
  pair('sich freuen', 'über', 'Besuch', 421, 'über den Besuch'),
];
const phrases = (j: { suggestions: { phrase: string }[] }) => j.suggestions.map((s) => s.phrase);

test('splitPrepositionalPhrase keeps noun and verb and names the preposition', () => {
  assert.deepEqual(splitPrepositionalPhrase('an einer Sitzung teilnehmen'), {
    words: ['Sitzung', 'teilnehmen'],
    sich: false,
    particle: null,
    preposition: 'an',
    prepositionTyped: 'an',
  });
  assert.equal(splitPrepositionalPhrase('sich an der Diskussion beteiligen')?.sich, true);
});

test('splitPrepositionalPhrase maps contractions, also capitalised at the start', () => {
  const zur = splitPrepositionalPhrase('Zur Verfügung stellen');
  assert.equal(zur?.preposition, 'zu');
  assert.equal(zur?.prepositionTyped, 'Zur');
  assert.deepEqual(zur?.words, ['Verfügung', 'stellen']);
  assert.equal(splitPrepositionalPhrase('im Mittelpunkt stehen')?.preposition, 'in');
  assert.equal(splitPrepositionalPhrase('kommt zum Einsatz')?.preposition, 'zu');
});

test('splitPrepositionalPhrase leaves a trailing particle a particle', () => {
  assert.equal(splitPrepositionalPhrase('legt eine Pause ein'), null);
  assert.equal(splitPrepositionalPhrase('nimmt ein Foto auf'), null);
});

test('splitPrepositionalPhrase rejects two prepositions, none, or no verb', () => {
  assert.equal(splitPrepositionalPhrase('bis zum Ende warten'), null);
  assert.equal(splitPrepositionalPhrase('Entscheidung treffen'), null);
  assert.equal(splitPrepositionalPhrase('an der Sitzung'), null);
});

test('judgePreposition: the usual preposition is usual', () => {
  const j = judgePreposition('teilnehmen', false, 'an', sitzung);
  assert.equal(j.verdict, 'usual');
  assert.equal(j.matched?.phrase, 'an den Sitzungen teilnehmen');
  assert.deepEqual(j.suggestions, []);
});

test('judgePreposition: a preposition far below the best one is another preposition', () => {
  const j = judgePreposition('teilnehmen', false, 'bei', sitzung);
  assert.equal(j.verdict, 'unusual');
  assert.equal(j.otherPreposition, true);
  assert.deepEqual(phrases(j), ['an den Sitzungen teilnehmen']);
});

test('judgePreposition: a weak pair in the data is not usual', () => {
  const j = judgePreposition('kommen', false, 'in', einsatz);
  assert.equal(j.verdict, 'unusual');
  assert.equal(j.otherPreposition, true);
  assert.deepEqual(phrases(j), ['zum Einsatz kommen']);
});

test('judgePreposition: a verb without pairs for the noun gets pairs with the typed preposition', () => {
  const j = judgePreposition('machen', false, 'an', sitzung);
  assert.equal(j.verdict, 'unusual');
  assert.equal(j.otherPreposition, false);
  assert.deepEqual(j.suggestions.map((s) => s.partnerWord), ['teilnehmen']);
});

test('judgePreposition: without pairs for the typed preposition, the noun\'s top pairs', () => {
  const j = judgePreposition(null, false, 'über', sitzung);
  assert.equal(j.otherPreposition, false);
  assert.deepEqual(j.suggestions.map((s) => s.partnerWord), ['teilnehmen', 'beschließen', 'einladen']);
});

test('judgePreposition: a dropped sich still matches the reflexive pair', () => {
  const j = judgePreposition('beteiligen', false, 'an', diskussion);
  assert.equal(j.verdict, 'usual');
  assert.equal(j.matched?.phrase, 'sich an der Diskussion beteiligen');
  assert.equal(j.matched?.partnerWord, 'beteiligen');
});

test('judgePreposition: a usual preposition names a stronger one of the same verb', () => {
  const j = judgePreposition('freuen', true, 'über', besuch);
  assert.equal(j.verdict, 'usual');
  assert.deepEqual(phrases(j), ['sich auf ihren Besuch freuen']);
});

test('judgePreposition: no pair above the floor is no data', () => {
  const j = judgePreposition('teilnehmen', false, 'mit', [pair('teilnehmen', 'mit', 'Sitzung', 5)]);
  assert.equal(j.verdict, 'noData');
  assert.deepEqual(j.suggestions, []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLoadable, parseExampleLine, parsePairLine } from './labVerbPairsTsv.ts';

test('parses a pair line', () => {
  assert.deepEqual(parsePairLine('obl\tstehen\tin\tKritik\tin der Kritik\t812.400\t153'), {
    relation: 'obl',
    verb: 'stehen',
    prep: 'in',
    noun: 'Kritik',
    phraseNoun: 'in der Kritik',
    score: 812.4,
    pairFreq: 153,
  });
});

test('keeps an empty preposition', () => {
  assert.equal(parsePairLine('obj\tüben\t\tKritik\tKritik\t2786.419\t251')?.prep, '');
});

test('rejects malformed pair lines', () => {
  assert.equal(parsePairLine('obj\tüben\t\tKritik\tKritik\t2786.419'), null);
  assert.equal(parsePairLine('iobj\tgeben\t\tKind\tKind\t12.000\t9'), null);
  assert.equal(parsePairLine('obj\tüben\t\tKritik\tKritik\tabc\t251'), null);
  assert.equal(parsePairLine('obj\tüben\t\tKritik\tKritik\t2786.419\tviele'), null);
});

test('parses an example line', () => {
  assert.deepEqual(
    parseExampleLine('obj\tüben\t\tKritik\t2\tKritik übte er in seiner Rede auch.\tübte\tKritik'),
    {
      relation: 'obj',
      verb: 'üben',
      prep: '',
      noun: 'Kritik',
      rank: 2,
      sentence: 'Kritik übte er in seiner Rede auch.',
      verbSurface: 'übte',
      nounSurface: 'Kritik',
    },
  );
  assert.equal(parseExampleLine('obj\tüben\t\tKritik\terste\tSatz.\tübte\tKritik'), null);
  assert.equal(parseExampleLine('obj\tüben\t\tKritik\t2\tSatz.\tübte'), null);
});

test('refuses an export with no pairs', () => {
  assert.throws(() => assertLoadable(0, 0), /no pairs/);
  assert.throws(() => assertLoadable(1000, 11), /malformed/);
  assert.doesNotThrow(() => assertLoadable(1000, 10));
});

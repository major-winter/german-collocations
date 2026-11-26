import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLoadable,
  assertMatchesManifest,
  parseExampleLine,
  parseGenderLine,
  parseManifest,
  parsePairLine,
} from './labVerbPairsTsv.ts';

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

test('parses the manifest', () => {
  assert.deepEqual(parseManifest('pairs\t122454\nexamples\t364370\ngenders\t7194\n'), {
    pairs: 122454,
    examples: 364370,
    genders: 7194,
  });
  assert.equal(parseManifest(''), null);
  assert.equal(parseManifest('pairs\t122454\n'), null);
  assert.equal(parseManifest('pairs\tmany\nexamples\t3\ngenders\t1\n'), null);
});

test('parseManifest refuses a manifest without genders', () => {
  assert.equal(parseManifest('pairs\t122454\nexamples\t364370\n'), null);
});

test('parses a gender line', () => {
  assert.deepEqual(parseGenderLine('Entscheidung\tdie'), { noun: 'Entscheidung', article: 'die' });
  assert.equal(parseGenderLine('Entscheidung\tden'), null);
  assert.equal(parseGenderLine('Entscheidung'), null);
  assert.equal(parseGenderLine('\tdie'), null);
});

test('refuses files whose line counts differ from the manifest', () => {
  const manifest = { pairs: 122454, examples: 364370, genders: 7194 };
  assert.doesNotThrow(() => assertMatchesManifest(manifest, 122454, 364370, 7194));
  assert.throws(() => assertMatchesManifest(manifest, 61000, 364370, 7194), /pairs.*61,000.*122,454/);
  assert.throws(() => assertMatchesManifest(manifest, 122454, 0, 7194), /examples.*0.*364,370/);
  assert.throws(() => assertMatchesManifest(manifest, 122454, 364370, 0), /genders.*0.*7,194/);
});

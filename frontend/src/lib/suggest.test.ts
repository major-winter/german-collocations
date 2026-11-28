import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { LemmaSuggestion } from '@collocations/types';
import {
  createSuggester, moveActive, suggestionAnnouncement, suggestionQuery, suggestionRows,
  type SuggestionRow,
} from './suggest.ts';

const entscheidung: LemmaSuggestion = { lemma: 'Entscheidung', wordClass: 'noun', article: 'die' };
const entscheiden: LemmaSuggestion = { lemma: 'entscheiden', wordClass: 'verb', article: null };

test('a suggestion query is the trimmed text, from two characters on', () => {
  assert.equal(suggestionQuery('  Entsch '), 'Entsch');
  assert.equal(suggestionQuery('E'), null);
  assert.equal(suggestionQuery('  e  '), null);
  assert.equal(suggestionQuery(''), null);
  assert.equal(suggestionQuery('ab'), 'ab');
});

test('a phrase is never sent: the check handles it on Enter (#77)', () => {
  assert.equal(suggestionQuery('eine Entscheidung'), null);
  assert.equal(suggestionQuery('Entscheidung '), 'Entscheidung');
});

test('rows keep the server order, mark the typed prefix and open the lemma page', () => {
  const rows = suggestionRows([entscheidung, entscheiden], 'entsch');
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { head: rows[0].head, tail: rows[0].tail, article: rows[0].article, to: rows[0].to },
    { head: 'Entsch', tail: 'eidung', article: 'die', to: '/wort/Entscheidung' },
  );
  assert.equal(rows[1].article, null); // never guessed
  assert.equal(rows[1].to, '/wort/entscheiden');
});

test('a lemma that does not start with the query (an inflected form was typed) has no marked prefix', () => {
  const [row] = suggestionRows([entscheiden], 'entschied');
  assert.equal(row.head, '');
  assert.equal(row.tail, 'entscheiden');
});

test('a lemma with special characters is encoded in its route', () => {
  const [row] = suggestionRows([{ lemma: 'Straße/Weg', wordClass: 'noun', article: 'die' }], 'Str');
  assert.equal(row.to, '/wort/Stra%C3%9Fe%2FWeg');
});

test('the class label is singular German and nouns, verbs, adjectives carry the app dot', () => {
  const rows = suggestionRows([
    entscheidung, entscheiden,
    { lemma: 'entscheidend', wordClass: 'adjective', article: null },
    { lemma: 'entsprechend', wordClass: 'adverb', article: null },
    { lemma: 'Entscheid', wordClass: 'name', article: null },
    { lemma: 'entsch', wordClass: 'other', article: null },
  ], 'ents');
  assert.deepEqual(rows.map((r) => r.classLabel), ['Substantiv', 'Verb', 'Adjektiv', 'Adverb', 'Name', null]);
  assert.deepEqual(rows.map((r) => r.dot), ['bg-pos-noun', 'bg-pos-verb', 'bg-pos-adjective', null, null, null]);
});

test('every row has its own id for aria-activedescendant', () => {
  const rows = suggestionRows([entscheidung, entscheiden], 'ent');
  assert.equal(new Set(rows.map((r) => r.id)).size, 2);
});

test('arrow keys walk the rows and pass through "none" (the typed text) at both ends', () => {
  assert.equal(moveActive(-1, 'ArrowDown', 3), 0);
  assert.equal(moveActive(0, 'ArrowDown', 3), 1);
  assert.equal(moveActive(2, 'ArrowDown', 3), -1);
  assert.equal(moveActive(-1, 'ArrowUp', 3), 2);
  assert.equal(moveActive(2, 'ArrowUp', 3), 1);
  assert.equal(moveActive(0, 'ArrowUp', 3), -1);
  assert.equal(moveActive(-1, 'ArrowDown', 0), -1);
});

test('the announcement says how many suggestions there are, in German', () => {
  assert.equal(suggestionAnnouncement(0), 'Keine Vorschläge');
  assert.equal(suggestionAnnouncement(1), '1 Vorschlag. Mit den Pfeiltasten wählen.');
  assert.equal(suggestionAnnouncement(6), '6 Vorschläge. Mit den Pfeiltasten wählen.');
});

// ---- the debouncer ----

function setup(load: (q: string, signal: AbortSignal) => Promise<LemmaSuggestion[]>) {
  const results: SuggestionRow[][] = [];
  const s = createSuggester({ load, onRows: (rows) => results.push(rows), delayMs: 140 });
  return { s, results };
}
const flush = () => new Promise((r) => setImmediate(r));

test('typing waits for a pause, then asks once with the last text', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const { s, results } = setup(async (q) => { calls.push(q); return [entscheidung]; });
  s.input('En');
  s.input('Ent');
  s.input('Entsch');
  mock.timers.tick(139);
  assert.deepEqual(calls, []);
  mock.timers.tick(1);
  await flush();
  assert.deepEqual(calls, ['Entsch']);
  assert.equal(results.at(-1)?.[0].to, '/wort/Entscheidung');
  mock.timers.reset();
});

test('under two characters asks nothing and clears the rows at once', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const { s, results } = setup(async (q) => { calls.push(q); return []; });
  s.input('Ent');
  s.input('E');
  mock.timers.tick(500);
  await flush();
  assert.deepEqual(calls, []);
  assert.deepEqual(results.at(-1), []);
  mock.timers.reset();
});

test('a newer key aborts the request in flight and drops its answer', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const signals: AbortSignal[] = [];
  const answers: ((v: LemmaSuggestion[]) => void)[] = [];
  const { s, results } = setup((_q, signal) => {
    signals.push(signal);
    return new Promise((resolve) => answers.push(resolve));
  });
  s.input('Ent');
  mock.timers.tick(140);
  s.input('Entsch');
  assert.equal(signals[0].aborted, true);
  answers[0]([entscheiden]); // late answer for the old text
  await flush();
  assert.equal(results.length, 0);
  mock.timers.tick(140);
  answers[1]([entscheidung]);
  await flush();
  assert.equal(results.length, 1);
  assert.equal(results[0][0].head, 'Entsch');
  mock.timers.reset();
});

test('a failed request shows no rows and never throws', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { s, results } = setup(async () => { throw new Error('network'); });
  s.input('Entsch');
  mock.timers.tick(140);
  await flush();
  assert.deepEqual(results.at(-1), []);
  mock.timers.reset();
});

test('cancel stops a pending request and its answer (Enter, selection, leaving the field)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const { s, results } = setup(async (q) => { calls.push(q); return [entscheidung]; });
  s.input('Entsch');
  s.cancel();
  mock.timers.tick(500);
  await flush();
  assert.deepEqual(calls, []);
  assert.equal(results.length, 0);
  mock.timers.reset();
});

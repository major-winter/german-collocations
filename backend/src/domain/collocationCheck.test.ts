import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVerbLemma, splitPhrase } from './collocationCheck.ts';

test('splitPhrase drops determiners and keeps noun and verb in order', () => {
  assert.deepEqual(splitPhrase('eine Entscheidung machen'), { words: ['Entscheidung', 'machen'], sich: false, particle: null });
  assert.deepEqual(splitPhrase('  macht   keine Entscheidung '), { words: ['macht', 'Entscheidung'], sich: false, particle: null });
  assert.deepEqual(splitPhrase('Eine Entscheidung machen'), { words: ['Entscheidung', 'machen'], sich: false, particle: null });
});

test('splitPhrase remembers sich and a trailing separable particle', () => {
  assert.deepEqual(splitPhrase('sich Mühe geben'), { words: ['Mühe', 'geben'], sich: true, particle: null });
  assert.deepEqual(splitPhrase('legt eine Pause ein'), { words: ['legt', 'Pause'], sich: false, particle: 'ein' });
});

test('splitPhrase rejects anything that is not exactly noun + verb', () => {
  assert.equal(splitPhrase('Entscheidung'), null);
  assert.equal(splitPhrase('eine wichtige Entscheidung treffen'), null);
  assert.equal(splitPhrase('a b c d e f'), null);
  assert.equal(splitPhrase('die das'), null);
});

test('pickVerbLemma never lets a particle verb stand for the bare verb', () => {
  const nimmt = [
    { verb: 'nehmen', uses: 231 },
    { verb: 'aufnehmen', uses: 59 },
    { verb: 'abnehmen', uses: 14 },
    { verb: 'sich nehmen', uses: 8 },
  ];
  assert.equal(pickVerbLemma('nimmt', null, nimmt), 'nehmen');
  assert.equal(pickVerbLemma('nimmt', null, [{ verb: 'aufnehmen', uses: 300 }, { verb: 'nehmen', uses: 10 }]), 'nehmen');
});

test('pickVerbLemma uses a typed particle, attached or trailing', () => {
  const legt = [{ verb: 'legen', uses: 71 }, { verb: 'festlegen', uses: 39 }, { verb: 'einlegen', uses: 5 }];
  assert.equal(pickVerbLemma('legt', 'ein', legt), 'einlegen');
  assert.equal(pickVerbLemma('legt', 'ein', [{ verb: 'legen', uses: 71 }]), null);
  assert.equal(pickVerbLemma('aufnimmt', null, [{ verb: 'nehmen', uses: 10 }, { verb: 'aufnehmen', uses: 3 }]), 'aufnehmen');
  assert.equal(pickVerbLemma('aufgenommen', null, [{ verb: 'aufnehmen', uses: 427 }]), 'aufnehmen');
});

test('pickVerbLemma strips sich, prefers a typed lemma, and gives up on nothing', () => {
  assert.equal(pickVerbLemma('macht', null, [{ verb: 'machen', uses: 742 }, { verb: 'sich machen', uses: 41 }]), 'machen');
  assert.equal(pickVerbLemma('fällen', null, [{ verb: 'fällen', uses: 0 }]), 'fällen');
  assert.equal(pickVerbLemma('trefen', null, []), null);
});

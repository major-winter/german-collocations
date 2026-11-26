import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatorOf } from './impressum.ts';

test('operatorOf splits the address on | and trims every part', () => {
    assert.deepEqual(
        operatorOf({ name: ' Erika Muster ', address: 'Musterweg 1 | 12345 Musterstadt ', email: 'a@b.de' }),
        { name: 'Erika Muster', addressLines: ['Musterweg 1', '12345 Musterstadt'], email: 'a@b.de', placeholder: false },
    );
});

test('operatorOf marks missing details as placeholders (local dev)', () => {
    const op = operatorOf({ name: undefined, address: '', email: '  ' });
    assert.equal(op.placeholder, true);
    assert.equal(op.name, '[Name]');
    assert.deepEqual(op.addressLines, ['[Straße und Hausnummer]', '[PLZ und Ort]']);
    assert.equal(op.email, '[E-Mail-Adresse]');
});

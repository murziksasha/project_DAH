import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, roundMoney } from './money';

const norm = (s: string) => s.replace(/\s/g, ' ');

describe('L6: web money formatting via @dah/money', () => {
  it('always shows 2 decimals with hryvnia sign', () => {
    assert.equal(norm(formatMoney(1200.5)), '1 200,50 ₴');
    assert.equal(norm(formatMoney(100)), '100,00 ₴');
    assert.equal(norm(formatMoney('10.05')), '10,05 ₴');
  });
  it('signs and invalid input', () => {
    assert.equal(norm(formatMoney(-5)), '−5,00 ₴');
    assert.equal(norm(formatMoney(5, { signed: true })), '+5,00 ₴');
    assert.equal(formatMoney('abc'), '—');
    assert.equal(formatMoney(Number.NaN), '—');
  });
  it('rounds float noise canonically', () => {
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(1.005), 1.01);
  });
});

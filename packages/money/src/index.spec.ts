import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addMinor,
  roundMoney,
  subMinor,
  toMajor,
  toMinor,
} from './index';

describe('toMinor / toMajor', () => {
  it('converts common amounts', () => {
    assert.equal(toMinor(10.05), 1005);
    assert.equal(toMinor('10.05'), 1005);
    assert.equal(toMinor('-3.5'), -350);
    assert.equal(toMajor(1005), 10.05);
  });

  it('rounds fractional major to nearest kopiika', () => {
    assert.equal(toMinor(1.999), 200);
    assert.equal(toMinor('1.994'), 199);
  });
});

describe('roundMoney', () => {
  it('rounds via minor units', () => {
    assert.equal(roundMoney(10), 10);
    assert.equal(roundMoney('2.5'), 2.5);
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
  });
});

describe('addMinor / subMinor', () => {
  it('adds and subtracts kopiiky', () => {
    assert.equal(addMinor(100, 50, 25), 175);
    assert.equal(subMinor(100, 40), 60);
  });
});

import { addMinor, roundMoney, subMinor, toMajor, toMinor } from './money';

describe('money (minor units)', () => {
  it('converts major ↔ minor without float drift on 0.1+0.2', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMajor(30)).toBe(0.3);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('parses string majors', () => {
    expect(toMinor('10.05')).toBe(1005);
    expect(toMinor('-1.5')).toBe(-150);
  });

  it('adds and subtracts in kopiiky', () => {
    expect(addMinor(1005, 20)).toBe(1025);
    expect(subMinor(1005, 5)).toBe(1000);
  });
});

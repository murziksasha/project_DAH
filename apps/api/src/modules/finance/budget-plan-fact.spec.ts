import { roundMoney } from '../../common/utils/money';

/** Pure helpers mirrored from budget aggregation logic. */
function variance(planned: number, actual: number) {
  return roundMoney(planned - actual);
}

function variancePercent(planned: number, actual: number): number | null {
  if (planned <= 0) return null;
  return Math.round(((planned - actual) / planned) * 1000) / 10;
}

describe('budget plan/fact math', () => {
  it('computes underspend positive variance', () => {
    expect(variance(1000, 800)).toBe(200);
    expect(variancePercent(1000, 800)).toBe(20);
  });

  it('computes overspend negative variance', () => {
    expect(variance(500, 750)).toBe(-250);
    expect(variancePercent(500, 750)).toBe(-50);
  });

  it('null percent when no plan', () => {
    expect(variancePercent(0, 100)).toBeNull();
  });
});

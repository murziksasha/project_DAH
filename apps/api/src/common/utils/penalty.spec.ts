import { calcDailyPenalty, daysOverdue } from './penalty';

describe('penalty', () => {
  it('calcDailyPenalty zero when not overdue past grace', () => {
    expect(
      calcDailyPenalty(1000, {
        annualRatePercent: 120,
        graceDays: 10,
        daysOverdue: 5,
      }),
    ).toBe(0);
  });

  it('calcDailyPenalty applies annual rate / 365', () => {
    // 1000 * 1.2 / 365 ≈ 3.29
    const p = calcDailyPenalty(1000, {
      annualRatePercent: 120,
      graceDays: 0,
      daysOverdue: 1,
    });
    expect(p).toBeGreaterThan(3);
    expect(p).toBeLessThan(4);
  });

  it('respects dailyCap', () => {
    const p = calcDailyPenalty(100000, {
      annualRatePercent: 365,
      graceDays: 0,
      daysOverdue: 1,
      dailyCap: 1,
    });
    expect(p).toBe(1);
  });

  it('daysOverdue counts calendar days', () => {
    const due = new Date('2026-03-01T12:00:00.000Z');
    const now = new Date('2026-03-11T12:00:00.000Z');
    expect(daysOverdue(due, now)).toBe(10);
  });
});

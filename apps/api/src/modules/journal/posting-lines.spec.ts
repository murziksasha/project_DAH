import { buildPaymentLines } from './posting.service';

const dim = (fundId: string | null) => ({ fundId });
const sum = (lines: Array<{ debit?: number; credit?: number }>, k: 'debit' | 'credit') =>
  Math.round(lines.reduce((s, l) => s + (l[k] ?? 0), 0) * 100) / 100;

describe('buildPaymentLines (M4 multi-fund split)', () => {
  it('single fund: cash / receivable / advance on default fund', () => {
    const lines = buildPaymentLines(150, 100, 50, 'f1', dim);
    expect(lines).toEqual([
      { account: 'cash', debit: 150, fundId: 'f1' },
      { account: 'receivable', credit: 100, fundId: 'f1' },
      { account: 'advance', credit: 50, fundId: 'f1' },
    ]);
  });

  it('several funds: cash and receivable per fund, balanced', () => {
    const lines = buildPaymentLines(330, 300, 30, 'f1', dim, [
      { fundId: 'f1', amount: 200 },
      { fundId: 'f2', amount: 100 },
    ]);
    expect(sum(lines, 'debit')).toBe(330);
    expect(sum(lines, 'credit')).toBe(330);
    const f2 = lines.filter((l) => l.fundId === 'f2');
    expect(f2).toEqual([
      { account: 'cash', debit: 100, fundId: 'f2' },
      { account: 'receivable', credit: 100, fundId: 'f2' },
    ]);
    expect(lines.find((l) => l.account === 'advance')).toEqual({
      account: 'advance',
      credit: 30,
      fundId: 'f1',
    });
  });

  it('falls back to default fund when split does not match allocation', () => {
    const lines = buildPaymentLines(100, 100, 0, 'f1', dim, [
      { fundId: 'f1', amount: 50 },
      { fundId: 'f2', amount: 10 },
    ]);
    expect(lines.every((l) => l.fundId === 'f1')).toBe(true);
  });
});

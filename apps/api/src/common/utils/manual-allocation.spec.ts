import { planManualAllocation } from './manual-allocation';

describe('planManualAllocation', () => {
  const lines = [
    {
      id: 'l1',
      amount: 100,
      paidAmount: 0,
      dueDate: null,
      period: '2026-01',
      title: 'Січень',
    },
    {
      id: 'l2',
      amount: 50,
      paidAmount: 10,
      dueDate: null,
      period: '2026-02',
      title: 'Лютий',
    },
  ];

  it('allocates explicit lines and computes advance', () => {
    const r = planManualAllocation(lines, 200, [
      { accrualLineId: 'l2', amount: 40 },
      { accrualLineId: 'l1', amount: 100 },
    ]);
    expect(r.errors).toHaveLength(0);
    expect(r.allocations).toHaveLength(2);
    expect(r.allocations[0].period).toBe('2026-02');
    expect(r.advance).toBe(60);
  });

  it('rejects over-allocation on a line', () => {
    const r = planManualAllocation(lines, 200, [
      { accrualLineId: 'l2', amount: 50 },
    ]);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown line', () => {
    const r = planManualAllocation(lines, 10, [
      { accrualLineId: 'nope', amount: 10 },
    ]);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

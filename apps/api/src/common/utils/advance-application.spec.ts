import { planAdvanceApplication } from './advance-application';

describe('planAdvanceApplication (M5)', () => {
  it('applies FIFO up to the open amount', () => {
    const p = planAdvanceApplication(150, 300, [
      { paymentId: 'p1', remaining: 100 },
      { paymentId: 'p2', remaining: 200 },
    ]);
    expect(p).toEqual({
      total: 150,
      allocations: [
        { paymentId: 'p1', amount: 100 },
        { paymentId: 'p2', amount: 50 },
      ],
    });
  });

  it('is bounded by the stored advance balance', () => {
    expect(planAdvanceApplication(500, 120.5, [{ paymentId: 'p', remaining: 1000 }]).total).toBe(120.5);
  });

  it('is bounded by traceable payment remainders', () => {
    expect(planAdvanceApplication(500, 500, [{ paymentId: 'p', remaining: 30 }]).total).toBe(30);
  });

  it('no advance / nothing open → empty plan', () => {
    expect(planAdvanceApplication(0, 100, [{ paymentId: 'p', remaining: 100 }]).allocations).toEqual([]);
    expect(planAdvanceApplication(100, 0, [{ paymentId: 'p', remaining: 100 }]).total).toBe(0);
    expect(planAdvanceApplication(100, -5, []).total).toBe(0);
  });

  it('kopeck-exact (no float drift)', () => {
    const p = planAdvanceApplication(0.3, 0.3, [
      { paymentId: 'a', remaining: 0.1 },
      { paymentId: 'b', remaining: 0.2 },
    ]);
    expect(p.total).toBe(0.3);
    expect(p.allocations.map((x) => x.amount)).toEqual([0.1, 0.2]);
  });

  it('skips empty sources', () => {
    const p = planAdvanceApplication(10, 10, [
      { paymentId: 'a', remaining: 0 },
      { paymentId: 'b', remaining: 10 },
    ]);
    expect(p.allocations).toEqual([{ paymentId: 'b', amount: 10 }]);
  });
});

import { AccrualLineStatus } from '@prisma/client';
import { planFifoAllocation, resolveAccrualLineStatus } from './fifo-allocation';

describe('planFifoAllocation', () => {
  const lines = [
    {
      id: 'line-1',
      amount: 100,
      paidAmount: 0,
      dueDate: new Date('2026-01-14'),
      period: '2026-01',
      title: 'Січень',
    },
    {
      id: 'line-2',
      amount: 50,
      paidAmount: 10,
      dueDate: new Date('2026-02-14'),
      period: '2026-02',
      title: 'Лютий',
    },
  ];

  it('allocates FIFO across open lines', () => {
    const result = planFifoAllocation(lines, 120);
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0]).toMatchObject({ accrualLineId: 'line-1', amount: 100 });
    expect(result.allocations[1]).toMatchObject({ accrualLineId: 'line-2', amount: 20 });
    expect(result.advance).toBe(0);
  });

  it('returns advance when payment exceeds debt', () => {
    const result = planFifoAllocation(lines, 200);
    expect(result.allocations).toHaveLength(2);
    expect(result.advance).toBe(60);
  });

  it('skips fully paid lines', () => {
    const result = planFifoAllocation(
      [{ ...lines[0], paidAmount: 100 }, lines[1]],
      40,
    );
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].accrualLineId).toBe('line-2');
    expect(result.allocations[0].amount).toBe(40);
  });
});

describe('resolveAccrualLineStatus', () => {
  it('marks line as paid', () => {
    expect(resolveAccrualLineStatus(100, 100, null)).toBe(AccrualLineStatus.paid);
  });

  it('marks partially paid line as overdue when due date passed', () => {
    expect(
      resolveAccrualLineStatus(100, 50, new Date('2020-01-01')),
    ).toBe(AccrualLineStatus.overdue);
  });

  it('marks open line when nothing paid', () => {
    expect(
      resolveAccrualLineStatus(100, 0, new Date('2099-01-01')),
    ).toBe(AccrualLineStatus.open);
  });
});
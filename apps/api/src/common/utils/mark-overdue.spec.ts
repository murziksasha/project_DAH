import { AccrualLineStatus } from '@prisma/client';
import { markOverdueAccrualLines } from './mark-overdue';

describe('markOverdueAccrualLines', () => {
  it('updates past-due open lines', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = { accrualLine: { updateMany } };
    const n = await markOverdueAccrualLines(prisma as never, new Date('2026-07-15'));
    expect(n).toBe(3);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: AccrualLineStatus.overdue },
        where: expect.objectContaining({
          status: {
            in: [AccrualLineStatus.open, AccrualLineStatus.partially_paid],
          },
        }),
      }),
    );
  });
});

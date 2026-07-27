import { AccrualLineStatus, PrismaClient } from '@prisma/client';

/**
 * Flip open/partial lines past dueDate to overdue.
 * Safe to run repeatedly (idempotent for already overdue).
 */
export async function markOverdueAccrualLines(
  prisma: Pick<PrismaClient, 'accrualLine'>,
  now = new Date(),
): Promise<number> {
  const result = await prisma.accrualLine.updateMany({
    where: {
      dueDate: { lt: now },
      status: {
        in: [AccrualLineStatus.open, AccrualLineStatus.partially_paid],
      },
    },
    data: { status: AccrualLineStatus.overdue },
  });
  return result.count;
}

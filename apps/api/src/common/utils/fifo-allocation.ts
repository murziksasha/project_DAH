import { AccrualLineStatus } from '@prisma/client';
import { minMinor, subMinor, toMajor, toMinor } from './money';

export interface FifoLineInput {
  id: string;
  amount: number | string;
  paidAmount: number | string;
  dueDate: Date | null;
  period: string;
  title: string;
}

export interface FifoAllocation {
  accrualLineId: string;
  amount: number;
  period: string;
  title: string;
  lineBalance: number;
}

/**
 * Plan FIFO allocation. Inputs/outputs are major units (hryvnia);
 * arithmetic runs in integer minor units (kopiiky).
 */
export function planFifoAllocation(lines: FifoLineInput[], paymentAmount: number | string) {
  let remaining = toMinor(paymentAmount);
  const allocations: FifoAllocation[] = [];

  for (const line of lines) {
    if (remaining <= 0) break;
    const due = subMinor(toMinor(line.amount), toMinor(line.paidAmount));
    if (due <= 0) continue;
    const allocMinor = minMinor(remaining, due);
    allocations.push({
      accrualLineId: line.id,
      amount: toMajor(allocMinor),
      period: line.period,
      title: line.title,
      lineBalance: toMajor(due),
    });
    remaining = subMinor(remaining, allocMinor);
  }

  return {
    allocations,
    advance: toMajor(remaining),
  };
}

export function resolveAccrualLineStatus(
  lineAmount: number | string,
  paidAmount: number | string,
  dueDate: Date | null,
): AccrualLineStatus {
  const lineMinor = toMinor(lineAmount);
  const paidMinor = toMinor(paidAmount);
  if (paidMinor >= lineMinor) return AccrualLineStatus.paid;
  if (paidMinor > 0) {
    return dueDate && dueDate < new Date()
      ? AccrualLineStatus.overdue
      : AccrualLineStatus.partially_paid;
  }
  return dueDate && dueDate < new Date()
    ? AccrualLineStatus.overdue
    : AccrualLineStatus.open;
}

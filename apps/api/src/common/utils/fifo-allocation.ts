import { AccrualLineStatus } from '@prisma/client';
import { roundMoney } from './money';

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

export function planFifoAllocation(lines: FifoLineInput[], paymentAmount: number) {
  let remaining = paymentAmount;
  const allocations: FifoAllocation[] = [];

  for (const line of lines) {
    if (remaining <= 0) break;
    const due = roundMoney(Number(line.amount) - Number(line.paidAmount));
    if (due <= 0) continue;
    const allocAmount = roundMoney(Math.min(remaining, due));
    allocations.push({
      accrualLineId: line.id,
      amount: allocAmount,
      period: line.period,
      title: line.title,
      lineBalance: due,
    });
    remaining = roundMoney(remaining - allocAmount);
  }

  return {
    allocations,
    advance: roundMoney(remaining),
  };
}

export function resolveAccrualLineStatus(
  lineAmount: number,
  paidAmount: number,
  dueDate: Date | null,
): AccrualLineStatus {
  if (paidAmount >= lineAmount) return AccrualLineStatus.paid;
  if (paidAmount > 0) {
    return dueDate && dueDate < new Date()
      ? AccrualLineStatus.overdue
      : AccrualLineStatus.partially_paid;
  }
  return dueDate && dueDate < new Date()
    ? AccrualLineStatus.overdue
    : AccrualLineStatus.open;
}
import { roundMoney } from './money';
import type { FifoAllocation, FifoLineInput } from './fifo-allocation';

export interface ManualAllocInput {
  accrualLineId: string;
  amount: number;
}

/**
 * Apply explicit allocations (override FIFO). Excess payment → advance.
 * Throws-like via return errors array for validation before apply.
 */
export function planManualAllocation(
  lines: FifoLineInput[],
  paymentAmount: number,
  manual: ManualAllocInput[],
): {
  allocations: FifoAllocation[];
  advance: number;
  errors: string[];
} {
  const errors: string[] = [];
  const byId = new Map(lines.map((l) => [l.id, l]));
  const allocations: FifoAllocation[] = [];
  let used = 0;

  for (const m of manual) {
    if (!m.accrualLineId || !(m.amount > 0)) {
      errors.push('Кожен рядок розноски потребує accrualLineId і amount > 0');
      continue;
    }
    const line = byId.get(m.accrualLineId);
    if (!line) {
      errors.push(`Лінія ${m.accrualLineId} не відкрита або не належить квартирі`);
      continue;
    }
    const open = roundMoney(Number(line.amount) - Number(line.paidAmount));
    if (m.amount > open + 0.001) {
      errors.push(
        `Сума ${m.amount} перевищує залишок ${open} по лінії ${line.period}`,
      );
      continue;
    }
    allocations.push({
      accrualLineId: line.id,
      amount: roundMoney(m.amount),
      period: line.period,
      title: line.title,
      lineBalance: open,
    });
    used = roundMoney(used + m.amount);
  }

  if (used > paymentAmount + 0.001) {
    errors.push(
      `Сума розноски ${used} перевищує платіж ${paymentAmount}`,
    );
  }

  const advance = roundMoney(Math.max(0, paymentAmount - used));
  return { allocations, advance, errors };
}

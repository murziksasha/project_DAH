import { minMinor, toMajor, toMinor } from './money';

export interface AdvanceSource {
  paymentId: string;
  /** Part of the payment not yet allocated to accrual lines (UAH). */
  remaining: number;
}

export interface AdvancePlan {
  total: number;
  allocations: Array<{ paymentId: string; amount: number }>;
}

/**
 * M5: how much of an apartment advance to apply to one new accrual line.
 * Bounded by the line's open amount, the stored advance balance and the
 * traceable unallocated remainder of the apartment's payments (FIFO by payment).
 * All arithmetic in minor units (kopecks) via @dah/money.
 */
export function planAdvanceApplication(
  lineOpen: number,
  advanceBalance: number,
  sources: AdvanceSource[],
): AdvancePlan {
  const traceable = sources.reduce((s, p) => s + Math.max(0, toMinor(p.remaining)), 0);
  let left = minMinor(minMinor(Math.max(0, toMinor(lineOpen)), Math.max(0, toMinor(advanceBalance))), traceable);
  const allocations: AdvancePlan['allocations'] = [];
  for (const src of sources) {
    if (left <= 0) break;
    const avail = Math.max(0, toMinor(src.remaining));
    if (avail <= 0) continue;
    const take = minMinor(avail, left);
    allocations.push({ paymentId: src.paymentId, amount: toMajor(take) });
    left -= take;
  }
  const total = toMajor(allocations.reduce((s, a) => s + toMinor(a.amount), 0));
  return { total, allocations };
}

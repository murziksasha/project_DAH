import { roundMoney } from './money';

/**
 * Daily penalty (пеня) on overdue debt.
 * annualRatePercent 120 → ~0.3288%/day of debt after grace.
 */
export function calcDailyPenalty(
  debt: number,
  opts: {
    annualRatePercent: number;
    graceDays: number;
    daysOverdue: number;
    dailyCap?: number;
  },
): number {
  if (debt <= 0) return 0;
  if (opts.daysOverdue <= opts.graceDays) return 0;
  if (opts.annualRatePercent <= 0) return 0;
  const dailyRate = opts.annualRatePercent / 100 / 365;
  let amount = roundMoney(debt * dailyRate);
  if (opts.dailyCap != null && opts.dailyCap > 0) {
    amount = Math.min(amount, opts.dailyCap);
  }
  return amount > 0 ? amount : 0;
}

/** Whole days past dueDate (UTC calendar). */
export function daysOverdue(dueDate: Date, now = new Date()): number {
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.floor((today - due) / 86400000);
  return diff > 0 ? diff : 0;
}

/** Building setting: day of month for meter reading deadline (1–28). Default 5. */
export function normalizeMetersDeadlineDay(day?: number | null): number {
  if (day == null || !Number.isFinite(day)) return 5;
  return Math.min(28, Math.max(1, Math.floor(day)));
}

export function currentPeriodYm(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-');
  if (!y || !m) return period;
  return `${m}.${y}`;
}

export interface MetersDeadlineInfo {
  deadlineDay: number;
  /** Inclusive end of deadline day local */
  deadline: Date;
  daysLeft: number;
  /** true while current day-of-month <= deadline day */
  inWindow: boolean;
  /** true if past deadline this month */
  overdue: boolean;
  period: string;
  periodLabel: string;
}

export function getMetersDeadlineInfo(
  deadlineDay?: number | null,
  now = new Date(),
): MetersDeadlineInfo {
  const day = normalizeMetersDeadlineDay(deadlineDay);
  const deadline = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59, 999);
  const msLeft = deadline.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  const inWindow = now.getDate() <= day;
  const overdue = now.getDate() > day;
  const period = currentPeriodYm(now);
  return {
    deadlineDay: day,
    deadline,
    daysLeft,
    inWindow,
    overdue,
    period,
    periodLabel: formatPeriodLabel(period),
  };
}

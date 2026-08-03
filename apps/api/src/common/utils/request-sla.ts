/**
 * SLA helpers for service requests (dispatcher / УК portfolio).
 * Default hours per category; overridable via Building.settings.slaHoursByCategory.
 */

export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export type SlaStatus = 'ok' | 'warning' | 'breached' | 'none';

/** Default response time (hours) by request category. */
export const DEFAULT_SLA_HOURS: Record<string, number> = {
  sanitary: 24,
  electric: 24,
  cleaning: 72,
  elevator: 4,
  heating: 12,
  other: 48,
  default: 48,
};

/** Priority shortens SLA (multiplier on base hours). */
const PRIORITY_MULTIPLIER: Record<RequestPriority, number> = {
  low: 1.5,
  normal: 1,
  high: 0.5,
  urgent: 0.25,
};

export function resolveSlaHours(
  category: string,
  priority: RequestPriority = 'normal',
  overrides?: Record<string, number> | null,
): number {
  const map = { ...DEFAULT_SLA_HOURS, ...(overrides ?? {}) };
  const base = map[category] ?? map.default ?? 48;
  const mult = PRIORITY_MULTIPLIER[priority] ?? 1;
  return Math.max(1, Math.round(base * mult));
}

export function computeDueAt(
  from: Date,
  category: string,
  priority: RequestPriority = 'normal',
  overrides?: Record<string, number> | null,
): Date {
  const hours = resolveSlaHours(category, priority, overrides);
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function computeSlaStatus(
  dueAt: Date | string | null | undefined,
  status: string,
  now = new Date(),
): SlaStatus {
  if (!dueAt || status === 'done') return status === 'done' ? 'none' : 'none';
  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  if (Number.isNaN(due.getTime())) return 'none';
  const msLeft = due.getTime() - now.getTime();
  if (msLeft < 0) return 'breached';
  // Warning when less than 25% of remaining window… use absolute 4h or 25% of total from now if unknown
  const warnMs = 4 * 60 * 60 * 1000;
  if (msLeft <= warnMs) return 'warning';
  return 'ok';
}

export function isOverdue(
  dueAt: Date | string | null | undefined,
  status: string,
  now = new Date(),
): boolean {
  return computeSlaStatus(dueAt, status, now) === 'breached';
}

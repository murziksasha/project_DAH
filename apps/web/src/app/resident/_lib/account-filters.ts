export type TimelineKind = 'accrual' | 'payment';

export interface AccountLineLike {
  id: string;
  period: string;
  title: string;
  fundName: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
}

export interface TimelineEventLike {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  amount: number;
  meta?: Record<string, unknown>;
}

export interface AccountFiltersState {
  year: string; // '' | '2026'
  month: string; // '' | '01'..'12'
  kind: '' | TimelineKind;
  status: string; // '' | open | paid | ...
  q: string;
  view: 'periods' | 'feed';
}

export const EMPTY_FILTERS: AccountFiltersState = {
  year: '',
  month: '',
  kind: '',
  status: '',
  q: '',
  view: 'periods',
};

const MONTH_UK = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

export function monthLabel(mm: string): string {
  const i = Number(mm) - 1;
  return MONTH_UK[i] ?? mm;
}

export function periodKeyFromDate(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export function yearFromPeriod(period: string): string {
  return period.slice(0, 4);
}

export function monthFromPeriod(period: string): string {
  return period.slice(5, 7);
}

export function collectYears(
  lines: AccountLineLike[],
  timeline: TimelineEventLike[],
): string[] {
  const set = new Set<string>();
  for (const l of lines) {
    if (l.period?.length >= 4) set.add(yearFromPeriod(l.period));
  }
  for (const e of timeline) {
    if (e.at?.length >= 4) set.add(e.at.slice(0, 4));
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function matchesQuery(text: string, q: string): boolean {
  if (!q.trim()) return true;
  return text.toLowerCase().includes(q.trim().toLowerCase());
}

export function filterLines(
  lines: AccountLineLike[],
  f: AccountFiltersState,
): AccountLineLike[] {
  return lines.filter((l) => {
    if (f.year && yearFromPeriod(l.period) !== f.year) return false;
    if (f.month && monthFromPeriod(l.period) !== f.month) return false;
    if (f.status && l.status !== f.status) return false;
    if (
      !matchesQuery(
        `${l.title} ${l.fundName} ${l.period} ${l.status}`,
        f.q,
      )
    ) {
      return false;
    }
    return true;
  });
}

export function filterTimeline(
  events: TimelineEventLike[],
  f: AccountFiltersState,
): TimelineEventLike[] {
  return events.filter((e) => {
    const y = e.at.slice(0, 4);
    const m = e.at.slice(5, 7);
    if (f.year && y !== f.year) return false;
    if (f.month && m !== f.month) return false;
    if (f.kind && e.kind !== f.kind) return false;
    // status filter applies mainly to accruals via meta if present
    if (f.status && e.kind === 'accrual') {
      const st = String(e.meta?.status ?? '');
      if (st && st !== f.status) return false;
    }
    if (!matchesQuery(`${e.title} ${e.kind}`, f.q)) return false;
    return true;
  });
}

export interface PeriodGroup {
  year: string;
  months: Array<{
    period: string; // YYYY-MM
    label: string;
    events: TimelineEventLike[];
    accrued: number;
    paid: number;
  }>;
  accrued: number;
  paid: number;
}

export function groupTimelineByPeriod(events: TimelineEventLike[]): PeriodGroup[] {
  const byMonth = new Map<string, TimelineEventLike[]>();
  for (const e of events) {
    const key = periodKeyFromDate(e.at);
    const list = byMonth.get(key) ?? [];
    list.push(e);
    byMonth.set(key, list);
  }

  const years = new Map<string, PeriodGroup>();
  for (const [period, list] of Array.from(byMonth.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  )) {
    const year = period.slice(0, 4);
    const mm = period.slice(5, 7);
    let accrued = 0;
    let paid = 0;
    for (const e of list) {
      if (e.kind === 'accrual') accrued += e.amount;
      else paid += e.amount;
    }
    let g = years.get(year);
    if (!g) {
      g = { year, months: [], accrued: 0, paid: 0 };
      years.set(year, g);
    }
    g.months.push({
      period,
      label: `${monthLabel(mm)} ${year}`,
      events: list.sort((a, b) => b.at.localeCompare(a.at)),
      accrued,
      paid,
    });
    g.accrued += accrued;
    g.paid += paid;
  }

  return Array.from(years.values()).sort((a, b) => b.year.localeCompare(a.year));
}

export function filteredSummary(
  lines: AccountLineLike[],
  timeline: TimelineEventLike[],
) {
  const openDebt = lines.reduce((s, l) => s + Math.max(0, l.balance), 0);
  const accrued = lines.reduce((s, l) => s + l.amount, 0);
  const paidOnLines = lines.reduce((s, l) => s + l.paidAmount, 0);
  const paidEvents = timeline
    .filter((e) => e.kind === 'payment')
    .reduce((s, e) => s + e.amount, 0);
  return {
    debt: round2(openDebt),
    accrued: round2(accrued),
    paidOnLines: round2(paidOnLines),
    paidEvents: round2(paidEvents),
    count: lines.length + timeline.filter((e) => e.kind === 'payment').length,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function filterLabel(f: AccountFiltersState): string {
  const parts: string[] = [];
  if (f.year) parts.push(f.year);
  if (f.month) parts.push(monthLabel(f.month));
  if (f.kind === 'accrual') parts.push('нарахування');
  if (f.kind === 'payment') parts.push('платежі');
  if (f.status) parts.push(f.status);
  if (f.q.trim()) parts.push(`«${f.q.trim()}»`);
  return parts.length ? parts.join(' · ') : 'Увесь період';
}

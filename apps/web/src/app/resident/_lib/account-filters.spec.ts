import {
  collectYears,
  filterLines,
  filterTimeline,
  groupTimelineByPeriod,
  EMPTY_FILTERS,
} from './account-filters';

const lines = [
  {
    id: '1',
    period: '2026-03',
    title: 'Утримання',
    fundName: 'Основний',
    amount: 100,
    paidAmount: 50,
    balance: 50,
    status: 'partially_paid',
  },
  {
    id: '2',
    period: '2025-12',
    title: 'Опалення',
    fundName: 'Спец',
    amount: 200,
    paidAmount: 200,
    balance: 0,
    status: 'paid',
  },
];

const timeline = [
  {
    id: 'a1',
    kind: 'accrual' as const,
    at: '2026-03-01T00:00:00.000Z',
    title: 'Утримання',
    amount: 100,
  },
  {
    id: 'p1',
    kind: 'payment' as const,
    at: '2026-03-10T00:00:00.000Z',
    title: 'Платіж',
    amount: 50,
  },
  {
    id: 'a2',
    kind: 'accrual' as const,
    at: '2025-12-01T00:00:00.000Z',
    title: 'Опалення',
    amount: 200,
  },
];

describe('account-filters', () => {
  it('collects years', () => {
    expect(collectYears(lines, timeline)).toEqual(['2026', '2025']);
  });

  it('filters by year and status', () => {
    const f = { ...EMPTY_FILTERS, year: '2026', status: 'partially_paid' };
    expect(filterLines(lines, f)).toHaveLength(1);
    expect(filterLines(lines, f)[0].id).toBe('1');
  });

  it('filters timeline by kind', () => {
    const f = { ...EMPTY_FILTERS, kind: 'payment' as const };
    expect(filterTimeline(timeline, f)).toHaveLength(1);
  });

  it('groups by year and month', () => {
    const groups = groupTimelineByPeriod(timeline);
    expect(groups[0].year).toBe('2026');
    expect(groups[0].months[0].period).toBe('2026-03');
    expect(groups[0].months[0].events).toHaveLength(2);
  });

  it('search query', () => {
    const f = { ...EMPTY_FILTERS, q: 'опал' };
    expect(filterLines(lines, f)).toHaveLength(1);
  });
});

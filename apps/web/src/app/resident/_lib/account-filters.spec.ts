import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.deepEqual(collectYears(lines, timeline), ['2026', '2025']);
  });

  it('filters by year and status', () => {
    const f = { ...EMPTY_FILTERS, year: '2026', status: 'partially_paid' };
    assert.equal(filterLines(lines, f).length, 1);
    assert.equal(filterLines(lines, f)[0].id, '1');
  });

  it('filters timeline by kind', () => {
    const f = { ...EMPTY_FILTERS, kind: 'payment' as const };
    assert.equal(filterTimeline(timeline, f).length, 1);
  });

  it('groups by year and month', () => {
    const groups = groupTimelineByPeriod(timeline);
    assert.equal(groups[0].year, '2026');
    assert.equal(groups[0].months[0].period, '2026-03');
    assert.equal(groups[0].months[0].events.length, 2);
  });

  it('search query', () => {
    const f = { ...EMPTY_FILTERS, q: 'опал' };
    assert.equal(filterLines(lines, f).length, 1);
  });
});

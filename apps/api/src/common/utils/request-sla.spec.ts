import {
  computeDueAt,
  computeSlaStatus,
  resolveSlaHours,
} from './request-sla';

describe('request-sla', () => {
  it('resolves default hours by category', () => {
    expect(resolveSlaHours('elevator', 'normal')).toBe(4);
    expect(resolveSlaHours('sanitary', 'normal')).toBe(24);
    expect(resolveSlaHours('unknown_cat', 'normal')).toBe(48);
  });

  it('shortens SLA for urgent priority', () => {
    expect(resolveSlaHours('sanitary', 'urgent')).toBe(6); // 24 * 0.25
    expect(resolveSlaHours('cleaning', 'high')).toBe(36); // 72 * 0.5
  });

  it('computes dueAt from now + hours', () => {
    const from = new Date('2026-08-01T10:00:00.000Z');
    const due = computeDueAt(from, 'elevator', 'normal');
    expect(due.toISOString()).toBe('2026-08-01T14:00:00.000Z');
  });

  it('detects breached / warning SLA', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    expect(computeSlaStatus('2026-08-01T10:00:00.000Z', 'new', now)).toBe('breached');
    expect(computeSlaStatus('2026-08-01T14:00:00.000Z', 'new', now)).toBe('warning');
    expect(computeSlaStatus('2026-08-02T12:00:00.000Z', 'new', now)).toBe('ok');
    expect(computeSlaStatus('2026-08-01T10:00:00.000Z', 'done', now)).toBe('none');
  });
});

import { dailySlotDue, runExclusive } from './job-lock';

const at = (iso: string) => new Date(iso);

describe('job-lock (M9)', () => {
  it('dailySlotDue: before slot → no; after slot without run today → yes (catch-up)', () => {
    expect(dailySlotDue(at('2026-11-20T01:59:00Z'), 2, at('2026-11-19T02:00:05Z'))).toBe(false);
    expect(dailySlotDue(at('2026-11-20T02:00:00Z'), 2, at('2026-11-19T02:00:05Z'))).toBe(true);
    // worker was down at 02:00, restarted at 09:30 → catch up
    expect(dailySlotDue(at('2026-11-20T09:30:00Z'), 2, at('2026-11-19T02:00:05Z'))).toBe(true);
    // already ran after today's slot → no second run
    expect(dailySlotDue(at('2026-11-20T09:30:00Z'), 2, at('2026-11-20T02:00:07Z'))).toBe(false);
    expect(dailySlotDue(at('2026-11-20T03:00:00Z'), 2, null)).toBe(true);
  });

  it('runExclusive skips when the lease is held and records results', async () => {
    const held = { $queryRaw: jest.fn(async () => []), $executeRaw: jest.fn(async () => 1) };
    const fn = jest.fn(async () => 1);
    await expect(runExclusive(held as never, 'x', 1000, fn)).resolves.toEqual({ skipped: true });
    expect(fn).not.toHaveBeenCalled();

    const free = { $queryRaw: jest.fn(async () => [{ name: 'x' }]), $executeRaw: jest.fn(async () => 1) };
    await expect(runExclusive(free as never, 'x', 1000, fn)).resolves.toEqual({ skipped: false, result: 1 });
    expect(free.$executeRaw).toHaveBeenCalledTimes(1);

    const boom = jest.fn(async () => {
      throw new Error('fail');
    });
    await expect(runExclusive(free as never, 'x', 1000, boom)).rejects.toThrow('fail');
    expect(free.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('mocks without raw SQL run the job directly', async () => {
    await expect(runExclusive({} as never, 'x', 1000, async () => 'ok')).resolves.toEqual({
      skipped: false,
      result: 'ok',
    });
  });
});

import { JournalService } from './journal.service';

describe('JournalService.nextEntryNo (M1)', () => {
  const svc = new JournalService({} as never);
  const d = new Date(Date.UTC(2026, 5, 1));

  it('uses atomic JournalSequence upsert seeded from existing max', async () => {
    const client = {
      journalEntry: { aggregate: jest.fn(async () => ({ _max: { entryNo: 41 } })) },
      $queryRaw: jest.fn(async () => [{ lastNo: 42 }]),
    };
    await expect(svc.nextEntryNo(client as never, 'b1', d)).resolves.toBe(42);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (client.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray])[0].join('?');
    expect(sql).toMatch(/INSERT INTO "JournalSequence"/);
    expect(sql).toMatch(/ON CONFLICT/);
  });

  it('falls back to MAX+1 for clients without raw SQL', async () => {
    const client = { journalEntry: { aggregate: jest.fn(async () => ({ _max: { entryNo: null } })) } };
    await expect(svc.nextEntryNo(client as never, 'b1', d)).resolves.toBe(1);
  });
});

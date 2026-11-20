import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FundType } from '../src/prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JournalService } from '../src/modules/journal/journal.service';
import {
  disconnectTestDatabase,
  resetTestDatabase,
  seedTestFixtures,
  testPrisma,
} from './helpers/seed-test';

/** Phase 1 finance correctness on a real Postgres (M1, M2, M4, M5, M6). */
describe('Finance phase 1 (e2e)', () => {
  let app: INestApplication;
  let fx: Awaited<ReturnType<typeof seedTestFixtures>>;
  let token: string;
  let journal: JournalService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetTestDatabase();
    fx = await seedTestFixtures();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    journal = app.get(JournalService);
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  const balanced = async () => {
    const lines = await testPrisma.journalLine.findMany({
      where: { entry: { buildingId: fx.building.id } },
    });
    const d = lines.reduce((s, l) => s + Math.round(Number(l.debit) * 100), 0);
    const c = lines.reduce((s, l) => s + Math.round(Number(l.credit) * 100), 0);
    expect(d).toBe(c);
  };

  it('M1: concurrent journal writes get unique, gap-free entry numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        journal.write({
          type: 'adjustment',
          refType: 'ConcurrencyTest',
          refId: `c${i}`,
          buildingId: fx.building.id,
          valueDate: '2026-03-01',
          lines: [
            { account: 'cash', debit: 1, fundId: fx.fund.id },
            { account: 'income', credit: 1, fundId: fx.fund.id },
          ],
        } as never),
      ),
    );
    const nos = results.map((r) => (r as { entryNo: number }).entryNo).sort((a, b) => a - b);
    expect(new Set(nos).size).toBe(12);
    expect(nos[nos.length - 1] - nos[0]).toBe(11);
  });

  it('M2: concurrent writes with the same idempotency key create one entry', async () => {
    const input = {
      type: 'adjustment',
      refType: 'IdemTest',
      refId: 'same',
      buildingId: fx.building.id,
      valueDate: '2026-03-02',
      lines: [
        { account: 'cash', debit: 5, fundId: fx.fund.id },
        { account: 'income', credit: 5, fundId: fx.fund.id },
      ],
    } as never;
    const settled = await Promise.allSettled(Array.from({ length: 6 }, () => journal.write(input)));
    expect(settled.every((s) => s.status === 'fulfilled')).toBe(true);
    expect(await testPrisma.journalEntry.count({ where: { refType: 'IdemTest' } })).toBe(1);
  });

  let paymentId: string;

  it('overpayment goes to advance', async () => {
    const r = await http()
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ apartmentId: fx.apartment.id, amount: 1000, date: '2026-06-20', source: 'bank' })
      .expect(201);
    paymentId = r.body.id;
    const apt = await testPrisma.apartment.findUnique({ where: { id: fx.apartment.id } });
    expect(Number(apt!.advanceBalance)).toBe(575);
  });

  let accrualId: string;

  it('M5: advance is applied to a new accrual automatically', async () => {
    const r = await http()
      .post('/api/accruals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fundId: fx.fund.id,
        period: '2026-07',
        title: 'July',
        distribution: 'fixed_per_apartment',
        fixedAmount: 200,
      })
      .expect(201);
    accrualId = r.body.id;
    const line = await testPrisma.accrualLine.findFirst({ where: { accrualId } });
    expect(Number(line!.paidAmount)).toBe(200);
    expect(line!.status).toBe('paid');
    const apt = await testPrisma.apartment.findUnique({ where: { id: fx.apartment.id } });
    expect(Number(apt!.advanceBalance)).toBe(375);
    const alloc = await testPrisma.paymentAllocation.findMany({ where: { accrualLineId: line!.id } });
    expect(alloc).toHaveLength(1);
    expect(alloc[0].paymentId).toBe(paymentId);
    expect(
      await testPrisma.journalEntry.count({ where: { refType: 'AdvanceApplication' } }),
    ).toBeGreaterThan(0);
    await balanced();
  });

  it('M6: duplicate accrual (same fund, period, title) is rejected', async () => {
    await http()
      .post('/api/accruals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fundId: fx.fund.id,
        period: '2026-07',
        title: 'July',
        distribution: 'fixed_per_apartment',
        fixedAmount: 200,
      })
      .expect(400);
    expect(await testPrisma.accrual.count({ where: { fundId: fx.fund.id, period: '2026-07' } })).toBe(1);
  });

  it('M4: payment covering two funds is split per fund in the journal', async () => {
    const repair = await testPrisma.fund.create({
      data: { buildingId: fx.building.id, type: FundType.capital_repair, name: 'Repair', openingBalance: 0 },
    });
    // remaining advance (375) is consumed by the repair accrual, the rest stays open
    await http()
      .post('/api/accruals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fundId: repair.id,
        period: '2026-08',
        title: 'Repair Aug',
        distribution: 'fixed_per_apartment',
        fixedAmount: 500,
      })
      .expect(201);
    await http()
      .post('/api/accruals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fundId: fx.fund.id,
        period: '2026-08',
        title: 'Aug',
        distribution: 'fixed_per_apartment',
        fixedAmount: 300,
      })
      .expect(201);
    const r = await http()
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ apartmentId: fx.apartment.id, amount: 425, date: '2026-08-20', source: 'bank' })
      .expect(201);
    const entry = await testPrisma.journalEntry.findFirst({
      where: { refType: 'Payment', refId: r.body.id },
      include: { lines: true },
    });
    const recvFunds = new Set(
      entry!.lines.filter((l) => l.account === 'receivable').map((l) => l.fundId),
    );
    expect(recvFunds.size).toBe(2);
    await balanced();
  });

  it('void of a payment whose remainder was applied as advance stays balanced', async () => {
    await http()
      .patch(`/api/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'e2e void' })
      .expect(200);
    const line = await testPrisma.accrualLine.findFirst({ where: { accrualId } });
    expect(Number(line!.paidAmount)).toBe(0);
    const apt = await testPrisma.apartment.findUnique({ where: { id: fx.apartment.id } });
    expect(Number(apt!.advanceBalance)).toBe(0);
    // repair line: 375 came from the voided payment's advance, 125 from the later payment
    const repairLine = await testPrisma.accrualLine.findFirst({
      where: { accrual: { title: 'Repair Aug' } },
    });
    expect(Number(repairLine!.paidAmount)).toBe(125);
    const seedLine = await testPrisma.accrualLine.findFirst({ where: { accrualId: fx.accrual.id } });
    expect(Number(seedLine!.paidAmount)).toBe(0);
    await balanced();
  });
});

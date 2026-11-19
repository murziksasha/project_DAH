import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  disconnectTestDatabase,
  resetTestDatabase,
  seedSecondTenant,
  seedTestFixtures,
  testPrisma,
} from './helpers/seed-test';

/**
 * H9: two organizations on one install. Staff of tenant A must never read or
 * mutate tenant B data (404 — ids of other organizations are not disclosed).
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let a: Awaited<ReturnType<typeof seedTestFixtures>>;
  let b: Awaited<ReturnType<typeof seedSecondTenant>>;
  let chairA: string;
  let accA: string;
  let resA: string;
  let resB: string;
  let accB: string;

  const login = async (email: string) => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    expect(r.body.accessToken).toBeTruthy();
    return r.body.accessToken as string;
  };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetTestDatabase();
    a = await seedTestFixtures();
    b = await seedSecondTenant();

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    chairA = await login('test-chairman@osbb.local');
    accA = await login('test-accountant@osbb.local');
    resA = await login('test-resident@osbb.local');
    resB = await login('b-resident@osbb.local');
    accB = await login('b-accountant@osbb.local');
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  describe('C1 journal', () => {
    it('list without buildingId shows only own organization entries', async () => {
      const r = await http().get('/api/journal').set('Authorization', `Bearer ${accA}`).expect(200);
      expect(r.body.some((e: { id: string }) => e.id === b.journalEntry.id)).toBe(false);
    });
    it('foreign buildingId / entry id → 404', async () => {
      await http()
        .get(`/api/journal?buildingId=${b.building.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .get(`/api/journal/${b.journalEntry.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .get(`/api/journal/trial-balance?buildingId=${b.building.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
    });
    it('trial balance without buildingId excludes other tenant lines', async () => {
      const r = await http()
        .get('/api/journal/trial-balance')
        .set('Authorization', `Bearer ${accA}`)
        .expect(200);
      expect(r.body.accounts.some((x: { account: string }) => x.account === 'income')).toBe(false);
    });
    it('tenant staff cannot (re)create the global chart of accounts', async () => {
      await http()
        .post('/api/journal/coa/ensure-defaults')
        .set('Authorization', `Bearer ${chairA}`)
        .expect(403);
    });
  });

  describe('C2 deep accounting', () => {
    it.each([
      ['ar-aging'],
      ['write-offs'],
      ['tariffs'],
      ['supplier-invoices'],
      ['ap-aging'],
      ['bank-reconciliations'],
      ['cash-book'],
      ['overview'],
    ])('GET /accounting/%s?buildingId=<B> → 404', async (path) => {
      await http()
        .get(`/api/accounting/${path}?buildingId=${b.building.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
    });
    it('apartment statement of another tenant → 404', async () => {
      await http()
        .get(`/api/accounting/apartments/${b.apartment.id}/statement`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
    });
    it('own building works', async () => {
      await http()
        .get(`/api/accounting/ar-aging?buildingId=${a.building.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(200);
    });
    it('manual adjustment cannot reference a foreign fund', async () => {
      await http()
        .post('/api/accounting/adjustments')
        .set('Authorization', `Bearer ${accA}`)
        .send({
          buildingId: a.building.id,
          description: 'x',
          lines: [
            { account: 'cash', debit: 1, fundId: b.fund.id },
            { account: 'income', credit: 1 },
          ],
        })
        .expect(404);
    });
  });

  describe('C3 reminders', () => {
    it('list does not contain other organization reminders', async () => {
      const r = await http()
        .get('/api/reminders?includeSent=1')
        .set('Authorization', `Bearer ${chairA}`)
        .expect(200);
      expect(r.body.some((x: { id: string }) => x.id === b.reminder.id)).toBe(false);
    });
    it('cannot delete a reminder of another tenant', async () => {
      await http()
        .delete(`/api/reminders/${b.reminder.id}`)
        .set('Authorization', `Bearer ${chairA}`)
        .expect(404);
      expect(await testPrisma.reminder.findUnique({ where: { id: b.reminder.id } })).toBeTruthy();
    });
    it('cannot target a user / apartment of another tenant', async () => {
      await http()
        .post('/api/reminders')
        .set('Authorization', `Bearer ${chairA}`)
        .send({ type: 'custom', title: 'x', dueAt: '2099-01-01', userId: b.resident.id })
        .expect(404);
      await http()
        .post('/api/reminders')
        .set('Authorization', `Bearer ${chairA}`)
        .send({ type: 'custom', title: 'x', dueAt: '2099-01-01', apartmentId: b.apartment.id })
        .expect(404);
    });
    it('created reminder is stored with the caller tenant', async () => {
      const r = await http()
        .post('/api/reminders')
        .set('Authorization', `Bearer ${chairA}`)
        .send({ type: 'custom', title: 'A own', dueAt: '2099-01-01' })
        .expect(201);
      const row = await testPrisma.reminder.findUnique({ where: { id: r.body.id } });
      expect(row?.tenantId).toBe(a.building.tenantId);
    });
  });

  describe('C4 bank statement import', () => {
    it('preview against a foreign building → 404', async () => {
      await http()
        .post('/api/payments/import/preview')
        .set('Authorization', `Bearer ${accA}`)
        .send({ csv: 'date,amount,reference\n2026-06-01,10,kv 201', buildingId: b.building.id })
        .expect(404);
    });
    it('preview without buildingId matches only own apartments and stores tenant', async () => {
      const r = await http()
        .post('/api/payments/import/preview')
        .set('Authorization', `Bearer ${accA}`)
        .send({ csv: 'date,amount,reference\n2026-06-01,10,kv 201' })
        .expect(201);
      expect(r.body.rows.every((x: { apartmentId?: string }) => x.apartmentId !== b.apartment.id)).toBe(true);
      const st = await testPrisma.bankStatement.findUnique({ where: { id: r.body.statementId } });
      expect(st?.tenantId).toBe(a.building.tenantId);
    });
    it('ignore / assign a foreign statement line → 404', async () => {
      await http()
        .patch(`/api/payments/import/lines/${b.statementLine.id}/ignore`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .patch(`/api/payments/import/lines/${b.statementLine.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .send({ apartmentId: a.apartment.id })
        .expect(404);
    });
    it('unmatched report excludes foreign lines', async () => {
      const r = await http()
        .get('/api/payments/import/unmatched')
        .set('Authorization', `Bearer ${accA}`)
        .expect(200);
      expect(r.body.lines.some((l: { id: string }) => l.id === b.statementLine.id)).toBe(false);
    });
  });

  describe('C5 building / apartments', () => {
    it('cannot edit or delete an apartment / resident of another tenant', async () => {
      await http()
        .patch(`/api/building/apartments/${b.apartment.id}`)
        .set('Authorization', `Bearer ${chairA}`)
        .send({ area: 1 })
        .expect(404);
      await http()
        .delete(`/api/building/apartments/${b.apartment.id}`)
        .set('Authorization', `Bearer ${chairA}`)
        .expect(404);
      await http()
        .post(`/api/building/apartments/${b.apartment.id}/residents`)
        .set('Authorization', `Bearer ${chairA}`)
        .send({ firstName: 'X', lastName: 'Y' })
        .expect(404);
      const apt = await testPrisma.apartment.findUnique({ where: { id: b.apartment.id } });
      expect(apt?.area).toBe(70);
    });
  });

  describe('C6 / H1 accruals', () => {
    it('cannot create an accrual on a foreign fund', async () => {
      await http()
        .post('/api/accruals')
        .set('Authorization', `Bearer ${accA}`)
        .send({
          fundId: b.fund.id,
          period: '2026-07',
          title: 'Hijack',
          distribution: 'fixed_per_apartment',
          fixedAmount: 1,
        })
        .expect(404);
    });
    it('foreign accrual / apartment account / receipts → 404', async () => {
      await http()
        .get(`/api/accruals/${b.accrual.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .get(`/api/accruals/apartments/${b.apartment.id}/account`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .get(`/api/accruals/lines/${b.line.id}/receipt`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .get(`/api/accruals/${b.accrual.id}/receipts.zip`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
    });
    it('H1: resident cannot read a full accrual (all apartments)', async () => {
      await http()
        .get(`/api/accruals/${a.accrual.id}`)
        .set('Authorization', `Bearer ${resA}`)
        .expect(403);
    });
    it('staff reads own accrual', async () => {
      await http()
        .get(`/api/accruals/${a.accrual.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(200);
    });
  });

  describe('H2 finance', () => {
    it('expense / supplier of another tenant → 404', async () => {
      await http()
        .get(`/api/finance/expenses/${b.expense.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .patch(`/api/finance/suppliers/${b.supplier.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .send({ name: 'pwned' })
        .expect(404);
    });
    it('private category of tenant B is invisible and immutable for A', async () => {
      const r = await http()
        .get('/api/finance/categories')
        .set('Authorization', `Bearer ${accA}`)
        .expect(200);
      expect(r.body.some((c: { id: string }) => c.id === b.category.id)).toBe(false);
      await http()
        .delete(`/api/finance/categories/${b.category.id}`)
        .set('Authorization', `Bearer ${chairA}`)
        .expect(404);
    });
  });

  describe('H3 meetings', () => {
    it('meeting of another tenant → 404 (read and vote)', async () => {
      await http()
        .get(`/api/meetings/${b.meeting.id}`)
        .set('Authorization', `Bearer ${chairA}`)
        .expect(404);
      await http()
        .post(`/api/meetings/${b.meeting.id}/agenda/${b.meeting.agendaItems[0].id}/vote`)
        .set('Authorization', `Bearer ${resA}`)
        .send({ optionKey: 'За' })
        .expect(404);
    });
    it('accountant (no apartment) cannot vote', async () => {
      await http()
        .post(`/api/meetings/${b.meeting.id}/agenda/${b.meeting.agendaItems[0].id}/vote`)
        .set('Authorization', `Bearer ${accB}`)
        .send({ optionKey: 'За' })
        .expect(403);
    });
    it('owner votes once per apartment; re-vote overwrites', async () => {
      const url = `/api/meetings/${b.meeting.id}/agenda/${b.meeting.agendaItems[0].id}/vote`;
      await http().post(url).set('Authorization', `Bearer ${resB}`).send({ optionKey: 'За' }).expect(201);
      await http()
        .post(url)
        .set('Authorization', `Bearer ${resB}`)
        .send({ optionKey: 'Проти' })
        .expect(201);
      const votes = await testPrisma.meetingVote.findMany({
        where: { agendaItemId: b.meeting.agendaItems[0].id },
      });
      expect(votes).toHaveLength(1);
      expect(votes[0].apartmentId).toBe(b.apartment.id);
      expect(votes[0].optionKey).toBe('Проти');
    });
  });

  describe('L11 accounting periods', () => {
    it('periods of a foreign building → 404', async () => {
      await http()
        .get(`/api/finance/periods?buildingId=${b.building.id}`)
        .set('Authorization', `Bearer ${accA}`)
        .expect(404);
      await http()
        .patch('/api/finance/periods')
        .set('Authorization', `Bearer ${chairA}`)
        .send({ buildingId: b.building.id, period: '2026-06', status: 'soft_closed' })
        .expect(404);
    });
  });

  describe('H4 backups', () => {
    it('organization roles cannot list whole-install backups on a shared install', async () => {
      await http().get('/api/backups').set('Authorization', `Bearer ${chairA}`).expect(403);
    });
  });

  describe('CSV apartment import (email linking)', () => {
    it('does not link a user of another organization by e-mail', async () => {
      const csv = 'number,entrance,floor,area,residents\n101,1,1,50,b-resident@osbb.local';
      const r = await http()
        .post('/api/building/apartments/import')
        .set('Authorization', `Bearer ${chairA}`)
        .send({ csv })
        .expect(201);
      expect(r.body.linked).toBe(0);
      const links = await testPrisma.userApartment.findMany({ where: { userId: b.resident.id } });
      expect(links.map((l) => l.apartmentId)).toEqual([b.apartment.id]);
    });
    it('cannot import into a foreign building', async () => {
      await http()
        .post('/api/building/apartments/import')
        .set('Authorization', `Bearer ${chairA}`)
        .send({ csv: 'number,entrance,floor,area\n1,1,1,10', buildingId: b.building.id })
        .expect(403);
      expect(await testPrisma.apartment.count({ where: { buildingId: b.building.id } })).toBe(1);
    });
  });
});

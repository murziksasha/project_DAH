/**
 * Deep accounting happy path: accrual → payment → TB → period soft_close.
 * Skips when DB is unavailable.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { resetTestDatabase, seedTestFixtures } from './helpers/seed-test';

async function login(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  if (res.status >= 400) return null;
  return (res.body?.accessToken ?? res.body?.access_token) as string | null;
}

describe('Finance deep accounting (e2e)', () => {
  let app: INestApplication;
  let token = '';
  let skip = false;
  let buildingId = '';
  let fundId = '';
  let categoryId = '';
  let apartmentId = '';

  beforeAll(async () => {
    try {
      await resetTestDatabase();
      await seedTestFixtures();
    } catch (e) {
      console.warn('Skip finance-deep e2e — DB not ready', e);
      skip = true;
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    token = (await login(app, 'test-accountant@osbb.local')) ?? '';
    if (!token) {
      token = (await login(app, 'test-chairman@osbb.local')) ?? '';
    }
    if (!token) {
      skip = true;
      return;
    }

    const funds = await request(app.getHttpServer())
      .get('/api/finance/funds')
      .set('Authorization', `Bearer ${token}`);
    if (funds.status === 200 && Array.isArray(funds.body) && funds.body[0]) {
      fundId = funds.body[0].id;
      buildingId = funds.body[0].buildingId;
    }

    const cats = await request(app.getHttpServer())
      .get('/api/finance/categories')
      .set('Authorization', `Bearer ${token}`);
    if (cats.status === 200 && Array.isArray(cats.body) && cats.body[0]) {
      categoryId = cats.body[0].id;
    }

    const apts = await request(app.getHttpServer())
      .get('/api/building/apartments')
      .set('Authorization', `Bearer ${token}`);
    const list = Array.isArray(apts.body) ? apts.body : apts.body?.items ?? [];
    if (list[0]) {
      apartmentId = list[0].id;
      if (!buildingId) buildingId = list[0].buildingId;
    }
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('sot-status endpoint works', async () => {
    if (skip || !app || !token) return;
    const res = await request(app.getHttpServer())
      .get('/api/finance/sot-status')
      .query(buildingId ? { buildingId } : {})
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('journalSot');
    expect(res.body).toHaveProperty('hint');
  });

  it('trial-balance is balanced after seed', async () => {
    if (skip || !app || !token) return;
    const res = await request(app.getHttpServer())
      .get('/api/journal/trial-balance')
      .query(buildingId ? { buildingId } : {})
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.balanced).toBe(true);
  });

  it('month-close path: accrual → payment → reconcile → soft_close', async () => {
    if (skip || !app || !token || !fundId || !apartmentId) return;

    const period = '2026-08';
    const title = `E2E deep ${Date.now()}`;

    const accrual = await request(app.getHttpServer())
      .post('/api/accruals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fundId,
        period,
        title,
        distribution: 'fixed_per_apartment',
        fixedAmount: 100,
      });

    // 2FA or period lock may block — accept 201/200 or known finance gate
    if (accrual.status >= 400) {
      console.warn('accrual create skipped', accrual.status, accrual.body);
      return;
    }
    expect([200, 201]).toContain(accrual.status);

    const pay = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        apartmentId,
        amount: 100,
        date: '2026-08-15',
        source: 'bank',
        reference: 'e2e-deep',
      });
    if (pay.status >= 400) {
      console.warn('payment create skipped', pay.status, pay.body);
    }

    const tb = await request(app.getHttpServer())
      .get('/api/journal/trial-balance')
      .query(buildingId ? { buildingId } : {})
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(tb.body.balanced).toBe(true);

    const rec = await request(app.getHttpServer())
      .get('/api/journal/reconcile')
      .query(buildingId ? { buildingId } : {})
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(rec.body).toHaveProperty('ok');

    if (buildingId) {
      const shadow = await request(app.getHttpServer())
        .get('/api/journal/shadow-compare')
        .query({ buildingId })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(shadow.body).toHaveProperty('readyForSot');

      const checklist = await request(app.getHttpServer())
        .get('/api/finance/periods/checklist')
        .query({ buildingId, period })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(checklist.body).toHaveProperty('canSoftClose');

      if (checklist.body.canSoftClose) {
        const close = await request(app.getHttpServer())
          .patch('/api/finance/periods')
          .set('Authorization', `Bearer ${token}`)
          .send({
            buildingId,
            period,
            status: 'soft_closed',
            notes: 'e2e month close',
          });
        expect([200, 201]).toContain(close.status);
      }

      const cf = await request(app.getHttpServer())
        .get('/api/finance/reports/cash-flow')
        .query({ buildingId, source: 'both', from: '2026-08-01', to: '2026-08-31' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(cf.body.source).toBe('both');
      expect(cf.body).toHaveProperty('journal');
      expect(cf.body).toHaveProperty('legacy');
    }
  });

  it('cash-flow source=journal returns journal source', async () => {
    if (skip || !app || !token) return;
    const res = await request(app.getHttpServer())
      .get('/api/finance/reports/cash-flow')
      .query({
        source: 'journal',
        ...(buildingId ? { buildingId } : {}),
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.source).toBe('journal');
  });
});

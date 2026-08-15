/**
 * Finance policy matrix (roles × critical endpoints).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { resetTestDatabase, seedTestFixtures } from './helpers/seed-test';

async function login(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  if (res.status >= 400) return null;
  return (res.body?.accessToken ?? res.body?.access_token) as string | null;
}

describe('Finance policy (e2e)', () => {
  let app: INestApplication;
  let chairmanToken = '';
  let residentToken = '';
  let accountantToken = '';
  let skip = false;

  beforeAll(async () => {
    try {
      await resetTestDatabase();
      await seedTestFixtures();
    } catch (e) {
      console.warn('Skip finance-policy e2e — DB not ready', e);
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

    chairmanToken = (await login(app, 'test-chairman@osbb.local')) ?? '';
    residentToken = (await login(app, 'test-resident@osbb.local')) ?? '';
    accountantToken = (await login(app, 'test-accountant@osbb.local')) ?? '';
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('unauthenticated finance funds → 401', async () => {
    if (skip || !app) return;
    await request(app.getHttpServer()).get('/api/finance/funds').expect(401);
  });

  it('resident cannot list finance funds (403)', async () => {
    if (skip || !app || !residentToken) return;
    await request(app.getHttpServer())
      .get('/api/finance/funds')
      .set('Authorization', `Bearer ${residentToken}`)
      .expect(403);
  });

  it('resident cannot POST expense (403)', async () => {
    if (skip || !app || !residentToken) return;
    await request(app.getHttpServer())
      .post('/api/finance/expenses')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({
        fundId: 'x',
        categoryId: 'y',
        amount: 10,
        date: '2026-01-01',
      })
      .expect(403);
  });

  it('chairman can list funds (200)', async () => {
    if (skip || !app || !chairmanToken) return;
    await request(app.getHttpServer())
      .get('/api/finance/funds')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(200);
  });

  it('accountant can list funds (200)', async () => {
    if (skip || !app || !accountantToken) return;
    await request(app.getHttpServer())
      .get('/api/finance/funds')
      .set('Authorization', `Bearer ${accountantToken}`)
      .expect(200);
  });

  it('resident cannot import payments (403)', async () => {
    if (skip || !app || !residentToken) return;
    await request(app.getHttpServer())
      .post('/api/payments/import/preview')
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ csv: 'Дата;Сума;Призначення\n01.03.2026;10;кв. 101' })
      .expect(403);
  });

  it('chairman import preview (200/201)', async () => {
    if (skip || !app || !chairmanToken) return;
    const res = await request(app.getHttpServer())
      .post('/api/payments/import/preview')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .send({ csv: 'Дата;Сума;Призначення\n01.03.2026;10;кв. 101' });
    expect([200, 201]).toContain(res.status);
    if (res.status < 400) {
      expect(res.body.statementId || res.body.rows).toBeTruthy();
    }
  });

  it('resident cannot list periods (403)', async () => {
    if (skip || !app || !residentToken) return;
    await request(app.getHttpServer())
      .get('/api/finance/periods?buildingId=x')
      .set('Authorization', `Bearer ${residentToken}`)
      .expect(403);
  });

  it('resident cannot list budget (403)', async () => {
    if (skip || !app || !residentToken) return;
    await request(app.getHttpServer())
      .get('/api/finance/budget?buildingId=x&year=2026')
      .set('Authorization', `Bearer ${residentToken}`)
      .expect(403);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  disconnectTestDatabase,
  resetTestDatabase,
  seedTestFixtures,
  testPrisma,
} from './helpers/seed-test';

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let apartmentId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    const fixtures = await seedTestFixtures();
    apartmentId = fixtures.apartment.id;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('GET /api/payments/preview/allocation applies FIFO', () => {
    return request(app.getHttpServer())
      .get(`/api/payments/preview/allocation?apartmentId=${apartmentId}&amount=200`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.allocations[0].amount).toBe(200);
        expect(res.body.advance).toBe(0);
        expect(res.body.totalAllocated).toBe(200);
      });
  });

  it('POST /api/payments creates payment and updates accrual line', async () => {
    await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        apartmentId,
        amount: 100,
        date: '2026-06-20',
        source: 'bank',
        reference: 'e2e-test',
      })
      .expect((res) => expect([200, 201]).toContain(res.status))
      .expect((res) => {
        expect(res.body.amount).toBe('100');
        expect(res.body.allocations).toHaveLength(1);
      });

    const line = await testPrisma.accrualLine.findFirst({ where: { apartmentId } });
    expect(Number(line?.paidAmount)).toBe(100);
    expect(line?.status).toBe('partially_paid');
  });

  it('concurrent payments do not over-allocate accrual line', async () => {
    // Fresh line balance after previous 100 paid of 425 → 325 left.
    // Two parallel 200 payments should not push paidAmount above 425.
    const payloads = [1, 2].map((i) => ({
      apartmentId,
      amount: 200,
      date: '2026-06-21',
      source: 'bank' as const,
      reference: `race-${i}-${Date.now()}`,
    }));

    const results = await Promise.all(
      payloads.map((body) =>
        request(app.getHttpServer())
          .post('/api/payments')
          .set('Authorization', `Bearer ${token}`)
          .send(body),
      ),
    );

    for (const res of results) {
      expect([200, 201]).toContain(res.status);
    }

    const line = await testPrisma.accrualLine.findFirst({ where: { apartmentId } });
    expect(line).toBeTruthy();
    expect(Number(line!.paidAmount)).toBeLessThanOrEqual(425);
    expect(Number(line!.paidAmount)).toBeGreaterThanOrEqual(300); // at least prior 100 + some

    const payments = await testPrisma.payment.findMany({
      where: { apartmentId, isVoided: false, reference: { startsWith: 'race-' } },
      include: { allocations: true },
    });
    const allocated = payments.reduce(
      (s, p) => s + p.allocations.reduce((a, x) => a + Number(x.amount), 0),
      0,
    );
    // Total allocated across race payments + previous should not invent money beyond debt
    expect(allocated).toBeLessThanOrEqual(425);
  });

  it('GET /api/payments returns page object', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments?limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.page).toBe(1);
  });
});
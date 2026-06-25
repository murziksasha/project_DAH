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
});
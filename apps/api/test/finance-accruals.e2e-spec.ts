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

describe('Finance + Accruals (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let fundId: string;
  let apartmentId: string;
  let categoryId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    const fixtures = await seedTestFixtures();
    fundId = fixtures.fund.id;
    apartmentId = fixtures.apartment.id;

    const category = await testPrisma.expenseCategory.create({
      data: { name: 'Test cat', code: 'test_cat_e2e' },
    });
    categoryId = category.id;

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
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('GET /api/finance/funds returns fund', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/finance/funds')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.some((f: { id: string }) => f.id === fundId)).toBe(true);
  });

  it('POST /api/finance/expenses creates expense', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fundId,
        categoryId,
        amount: 1500.5,
        date: '2026-07-01',
        description: 'e2e expense',
      });
    expect([200, 201]).toContain(res.status);
    expect(Number(res.body.amount)).toBe(1500.5);
  });

  it('GET /api/finance/reports/cash-flow includes expenses', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/finance/reports/cash-flow')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.totalExpenses).toBeGreaterThanOrEqual(1500);
  });

  it('POST /api/accruals/preview calculates by_area', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/accruals/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        distribution: 'by_area',
        rate: 10,
      });
    expect([200, 201]).toContain(res.status);
    const rows = res.body;
    expect(Array.isArray(rows)).toBe(true);
    const row = rows.find((r: { apartmentId: string }) => r.apartmentId === apartmentId);
    expect(row).toBeTruthy();
    expect(row.amount).toBe(500); // 50 m2 * 10
  });

  it('POST /api/accruals creates period accrual and lines', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/accruals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fundId,
        period: '2026-07',
        title: 'E2E внесок',
        distribution: 'fixed_per_apartment',
        fixedAmount: 300,
        dueDate: '2026-07-20',
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.period).toBe('2026-07');
    expect(res.body.lines?.length).toBeGreaterThanOrEqual(1);

    const line = await testPrisma.accrualLine.findFirst({
      where: { apartmentId, accrual: { period: '2026-07' } },
    });
    expect(Number(line?.amount)).toBe(300);
    expect(line?.status).toBe('open');
  });

  it('GET /api/accruals/my-account as resident shows debt', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-resident@osbb.local', password: 'password123' });
    const residentToken = login.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/accruals/my-account')
      .set('Authorization', `Bearer ${residentToken}`)
      .expect(200);
    expect(res.body.summary.debt).toBeGreaterThan(0);
    expect(res.body.lines.length).toBeGreaterThan(0);
  });

  it('GET /api/payments/reports/debtors lists apartment', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments/reports/debtors')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.some((d: { apartmentId: string }) => d.apartmentId === apartmentId)).toBe(
      true,
    );
  });

  it('POST /api/payments/import/preview matches apartment from purpose', async () => {
    const csv = ['Дата;Сума;Призначення', '10.07.2026;50,00;Оплата внесків кв. 101'].join('\n');
    const res = await request(app.getHttpServer())
      .post('/api/payments/import/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv });
    expect([200, 201]).toContain(res.status);
    const body = res.body;
    expect(body.summary.matched).toBe(1);
    expect(body.rows[0].apartmentId).toBe(apartmentId);
  });

  it('mail status endpoint works', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mail/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty('smtpConfigured');
    expect(['log', 'smtp']).toContain(res.body.mode);
  });

  it('reminders process endpoint works', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/reminders/process')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('customSent');
    expect(res.body).toHaveProperty('debtSent');
  });

  it('GET board report PDF', async () => {
    const pdf = await request(app.getHttpServer())
      .get('/api/finance/reports/board.pdf?from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const data: Buffer[] = [];
        res.on('data', (c) => data.push(c));
        res.on('end', () => cb(null, Buffer.concat(data)));
      });
    expect([200, 201]).toContain(pdf.status);
    expect((pdf.body as Buffer).slice(0, 4).toString()).toBe('%PDF');
  });

  it('GET accrual receipts.zip and receipts.pdf', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/accruals?period=2026-07')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const accrualId = list.body[0]?.id as string;
    expect(accrualId).toBeTruthy();

    const zip = await request(app.getHttpServer())
      .get(`/api/accruals/${accrualId}/receipts.zip`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(zip.status);
    expect(zip.headers['content-type']).toMatch(/zip|octet-stream/);
    expect(Buffer.isBuffer(zip.body) || zip.body?.length > 0 || zip.text?.length > 0).toBeTruthy();

    const pdf = await request(app.getHttpServer())
      .get(`/api/accruals/${accrualId}/receipts.pdf`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const data: Buffer[] = [];
        res.on('data', (c) => data.push(c));
        res.on('end', () => cb(null, Buffer.concat(data)));
      });
    expect([200, 201]).toContain(pdf.status);
    const buf = pdf.body as Buffer;
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  disconnectTestDatabase,
  resetTestDatabase,
  seedTestFixtures,
  testPrisma,
} from './helpers/seed-test';

describe('Security + dual-approval smoke (e2e)', () => {
  let app: INestApplication;
  let chairmanToken: string;
  let accountantToken: string;
  let fundId: string;
  let categoryId: string;
  let buildingId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    const fixtures = await seedTestFixtures();
    fundId = fixtures.fund.id;
    buildingId = fixtures.building.id;

    const category = await testPrisma.expenseCategory.create({
      data: { name: 'Smoke cat', code: 'smoke_cat_e2e' },
    });
    categoryId = category.id;

    // Dual-control threshold 1000 UAH
    await testPrisma.building.update({
      where: { id: buildingId },
      data: {
        settings: {
          expenseDualApprovalThreshold: 1000,
          registrationInviteCode: 'SMOKE-INVITE',
        },
      },
    });

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const chairmanLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    chairmanToken = chairmanLogin.body.accessToken;
    expect(chairmanToken).toBeTruthy();

    const accLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-accountant@osbb.local', password: 'password123' });
    accountantToken = accLogin.body.accessToken;
    expect(accountantToken).toBeTruthy();
  });

  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  it('public health is minimal (no db/redis leak)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.db).toBeUndefined();
    expect(res.body.redis).toBeUndefined();
    expect(['ok', 'down']).toContain(res.body.status);
  });

  it('health details requires auth', async () => {
    await request(app.getHttpServer()).get('/api/health/details').expect(401);
    const res = await request(app.getHttpServer())
      .get('/api/health/details')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(200);
    expect(res.body.db).toBeDefined();
  });

  it('password forgot is generic and creates token for known email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/password/forgot')
      .send({ email: 'test-chairman@osbb.local' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.ok).toBe(true);

    const unknown = await request(app.getHttpServer())
      .post('/api/auth/password/forgot')
      .send({ email: 'nobody@example.com' });
    expect([200, 201]).toContain(unknown.status);
    expect(unknown.body.ok).toBe(true);

    const tokens = await testPrisma.passwordResetToken.findMany({
      where: { user: { email: 'test-chairman@osbb.local' } },
    });
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('password reset with valid token changes password', async () => {
    const raw = 'e2e-reset-token-' + Date.now().toString(36);
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const user = await testPrisma.user.findUnique({
      where: { email: 'test-resident@osbb.local' },
    });
    expect(user).toBeTruthy();
    await testPrisma.passwordResetToken.create({
      data: {
        userId: user!.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/password/reset')
      .send({ token: raw, newPassword: 'NewHouse42' });
    expect([200, 201]).toContain(res.status);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-resident@osbb.local', password: 'NewHouse42' });
    expect([200, 201]).toContain(login.status);
    expect(login.body.accessToken).toBeDefined();
  });

  it('apartments list requires invite when invite code is configured', async () => {
    const noCode = await request(app.getHttpServer()).get('/api/auth/apartments').expect(200);
    expect(noCode.body.requiresInvite).toBe(true);
    expect(noCode.body.apartments).toEqual([]);

    const bad = await request(app.getHttpServer())
      .get('/api/auth/apartments')
      .query({ inviteCode: 'WRONG' });
    expect(bad.status).toBe(400);

    const ok = await request(app.getHttpServer())
      .get('/api/auth/apartments')
      .query({ inviteCode: 'SMOKE-INVITE' })
      .expect(200);
    expect(ok.body.requiresInvite).toBe(true);
    expect(ok.body.apartments.length).toBeGreaterThan(0);
  });

  it('global search returns apartments for staff', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/building/search')
      .query({ q: '101' })
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(200);
    expect(Array.isArray(res.body.apartments)).toBe(true);
    expect(res.body.apartments.some((a: { number: string }) => a.number === '101')).toBe(true);
  });

  it('notification inbox works for authenticated user', async () => {
    const user = await testPrisma.user.findUnique({
      where: { email: 'test-chairman@osbb.local' },
    });
    await testPrisma.appNotification.create({
      data: {
        userId: user!.id,
        title: 'Smoke',
        body: 'Test notification',
        kind: 'info',
        url: '/admin/dispatch',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/notifications/inbox')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(200);
    expect(res.body.unread).toBeGreaterThanOrEqual(1);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('expense below threshold is auto-approved', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/finance/expenses')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        fundId,
        categoryId,
        amount: 250,
        date: '2026-08-01',
        description: 'small expense',
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.approvalStatus).toBe('approved');
    expect(res.body.needsApproval).toBe(false);
  });

  it('expense at/above threshold is pending; second user approves', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/finance/expenses')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        fundId,
        categoryId,
        amount: 5000,
        date: '2026-08-02',
        description: 'large dual expense',
      });
    expect([200, 201]).toContain(create.status);
    expect(create.body.approvalStatus).toBe('pending');
    expect(create.body.needsApproval).toBe(true);
    const expenseId = create.body.id as string;

    // Creator cannot self-approve
    const self = await request(app.getHttpServer())
      .post(`/api/finance/expenses/${expenseId}/approve`)
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(self.status).toBe(400);

    const listPending = await request(app.getHttpServer())
      .get('/api/finance/expenses')
      .query({ approvalStatus: 'pending' })
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(200);
    expect(listPending.body.items.some((e: { id: string }) => e.id === expenseId)).toBe(true);

    const approve = await request(app.getHttpServer())
      .post(`/api/finance/expenses/${expenseId}/approve`)
      .set('Authorization', `Bearer ${chairmanToken}`);
    expect([200, 201]).toContain(approve.status);
    expect(approve.body.approvalStatus).toBe('approved');

    const listAll = await request(app.getHttpServer())
      .get('/api/finance/expenses')
      .query({ approvalStatus: 'approved' })
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(200);
    expect(listAll.body.items.some((e: { id: string }) => e.id === expenseId)).toBe(true);
  });

  it('lists sessions and can revoke a non-current session family', async () => {
    // Second login creates another session
    const second = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    expect([200, 201]).toContain(second.status);
    const token2 = second.body.accessToken as string;

    const list = await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${token2}`)
      .expect(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);

    // Revoke oldest other session if any; else self is ok
    const other = (list.body.items as Array<{ id: string; current?: boolean }>).find(
      (s) => !s.current,
    );
    if (other) {
      await request(app.getHttpServer())
        .delete(`/api/auth/sessions/${other.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
      const after = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
      expect(
        (after.body.items as Array<{ id: string }>).some((s) => s.id === other.id),
      ).toBe(false);
    }
  });

  it('login lockout after many bad passwords', async () => {
    // use a dedicated user so we don't lock fixtures used above
    const hash = await bcrypt.hash('password123', 4);
    const lockUser = await testPrisma.user.create({
      data: {
        email: 'test-lock@osbb.local',
        passwordHash: hash,
        firstName: 'Lock',
        lastName: 'User',
        role: 'resident',
        status: 'active',
        tenantId: (await testPrisma.tenant.findFirst())!.id,
      },
    });

    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: lockUser.email, password: 'wrong-password-xx' })
        .expect(401);
    }

    const locked = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lockUser.email, password: 'password123' });
    expect(locked.status).toBe(401);
    expect(String(locked.body.message)).toMatch(/заблок|lock/i);
  });
});

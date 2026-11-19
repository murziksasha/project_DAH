import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  disconnectTestDatabase,
  resetTestDatabase,
  seedSecondTenant,
  seedTestFixtures,
  testPrisma,
} from './helpers/seed-test';

/** Phase 3: RBAC on permissions (M15), Journal SoT switch, public endpoint review. */
describe('Phase 3 (e2e)', () => {
  let app: INestApplication;
  let fx: Awaited<ReturnType<typeof seedTestFixtures>>;
  let tenantB: Awaited<ReturnType<typeof seedSecondTenant>>;
  let chair: string;
  let accountant: string;
  let board: string;
  let resident: string;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) =>
    (await http().post('/api/auth/login').send({ email, password: 'password123' })).body
      .accessToken as string;

  beforeAll(async () => {
    await resetTestDatabase();
    fx = await seedTestFixtures();
    tenantB = await seedSecondTenant();
    const boardUser = await testPrisma.user.create({
      data: {
        email: 'test-board@osbb.local',
        passwordHash: await bcrypt.hash('password123', 4),
        firstName: 'Test',
        lastName: 'Board',
        role: UserRole.board,
        status: UserStatus.active,
        tenantId: fx.building.tenantId,
      },
    });
    await testPrisma.tenantMembership.create({
      data: { userId: boardUser.id, tenantId: fx.building.tenantId!, role: UserRole.board, status: UserStatus.active },
    });
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    chair = await login('test-chairman@osbb.local');
    accountant = await login('test-accountant@osbb.local');
    board = await login('test-board@osbb.local');
    resident = await login('test-resident@osbb.local');
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  describe('M15: board per SPEC/03 + SPEC/05', () => {
    it('board may approve a write-off created by someone else (SPEC/05 «manage finance»)', async () => {
      const created = await http()
        .post('/api/accounting/write-offs')
        .set('Authorization', `Bearer ${accountant}`)
        .send({ apartmentId: fx.apartment.id, amount: 1, reason: 'e2e' })
        .expect(201);
      await http()
        .post(`/api/accounting/write-offs/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${resident}`)
        .expect(403);
      const ok = await http()
        .post(`/api/accounting/write-offs/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${board}`);
      expect(ok.status).toBeLessThan(300);
    });

    it('maker-checker still applies to board', async () => {
      const created = await http()
        .post('/api/accounting/write-offs')
        .set('Authorization', `Bearer ${board}`)
        .send({ apartmentId: fx.apartment.id, amount: 1, reason: 'self' })
        .expect(201);
      await http()
        .post(`/api/accounting/write-offs/${created.body.id}/approve`)
        .set('Authorization', `Bearer ${board}`)
        .expect(403);
    });

    it('board cannot do corrections (SPEC/03 «Анулювання» board ❌): adjustments, year-end, transfer void', async () => {
      await http()
        .post('/api/accounting/year-end')
        .set('Authorization', `Bearer ${board}`)
        .send({ buildingId: fx.building.id, year: 2025 })
        .expect(403);
      await http()
        .post('/api/accounting/adjustments')
        .set('Authorization', `Bearer ${board}`)
        .send({ buildingId: fx.building.id, description: 'x', lines: [] })
        .expect(403);
      await http()
        .patch('/api/finance/transfers/does-not-exist/void')
        .set('Authorization', `Bearer ${board}`)
        .send({ reason: 'x' })
        .expect(403);
    });

    it('permission-based endpoints keep their audience', async () => {
      await http().get(`/api/finance/funds?buildingId=${fx.building.id}`).set('Authorization', `Bearer ${board}`).expect(200);
      await http().post('/api/finance/funds').set('Authorization', `Bearer ${resident}`).send({}).expect(403);
      await http().get('/api/users').set('Authorization', `Bearer ${board}`).expect(403);
      await http().get('/api/users').set('Authorization', `Bearer ${chair}`).expect(200);
    });
  });

  describe('Public endpoint review', () => {
    it('POST /kep/sessions/:id/complete ignores client signature data and returns only status', async () => {
      const residentUser = await testPrisma.user.findUniqueOrThrow({ where: { email: 'test-resident@osbb.local' } });
      const session = await testPrisma.signSession.create({
        data: {
          purpose: 'meeting_protocol',
          refType: 'Document',
          refId: 'secret-doc-id',
          userId: residentUser.id,
          provider: 'mock',
          status: 'waiting_user',
          digest: 'd'.repeat(64),
          documentTitle: 'Конфіденційний протокол',
          challenge: 'c'.repeat(32),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      });
      const res = await http()
        .post(`/api/kep/sessions/${session.id}/complete`)
        .send({ code: 'mock_ok', signatureCms: 'ZXZpbC1zaWduYXR1cmUtZnJvbS1hbi1hdHRhY2tlcg==', certificateSubject: 'CN=Attacker' })
        .expect(201);
      expect(res.body).toEqual({ sessionId: session.id, status: 'signed', signed: true });
      const stored = await testPrisma.signSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(stored.certificateSubject).not.toBe('CN=Attacker');
      expect(stored.signatureCms).not.toBe('ZXZpbC1zaWduYXR1cmUtZnJvbS1hbi1hdHRhY2tlcg==');
    });

    it('GET /identity/mock/authorize is not served when identity login is disabled', async () => {
      await http()
        .get('/api/identity/mock/authorize?state=s&redirect_uri=javascript:alert(1)')
        .expect(404);
    });

    it('GET /auth/apartments exposes only id/entrance/number and hides buildings with registration off', async () => {
      const open = await http().get('/api/auth/apartments').expect(200);
      for (const a of open.body.apartments as Array<Record<string, unknown>>) {
        expect(Object.keys(a).sort()).toEqual(['entrance', 'id', 'number']);
      }
      const b = await testPrisma.building.findUniqueOrThrow({ where: { id: fx.building.id } });
      const settings = (b.settings ?? {}) as Record<string, unknown>;
      await testPrisma.building.update({
        where: { id: fx.building.id },
        data: { settings: { ...settings, registrationEnabled: false } },
      });
      try {
        const closed = await http().get('/api/auth/apartments').expect(200);
        const ids = (closed.body.apartments as Array<{ id: string }>).map((a) => a.id);
        expect(ids).not.toContain(fx.apartment.id);
      } finally {
        await testPrisma.building.update({ where: { id: fx.building.id }, data: { settings: settings as object } });
      }
    });
  });

  describe('Journal SoT switch (guarded by readiness streak, reversible)', () => {
    const fundsSource = async () => {
      const res = await http()
        .get(`/api/finance/funds?buildingId=${fx.building.id}`)
        .set('Authorization', `Bearer ${chair}`)
        .expect(200);
      return (res.body as Array<{ balanceSource: string }>).map((f) => f.balanceSource);
    };

    it('refuses to enable without the streak (POST /journal/sot and PATCH settings)', async () => {
      await testPrisma.journalShadowRun.deleteMany({ where: { buildingId: fx.building.id } });
      const r = await http()
        .post('/api/journal/sot')
        .set('Authorization', `Bearer ${chair}`)
        .send({ buildingId: fx.building.id, enabled: true })
        .expect(409);
      expect(r.body.streakDays).toBe(0);
      await http()
        .patch('/api/building/settings')
        .set('Authorization', `Bearer ${chair}`)
        .send({ journalSot: true })
        .expect(409);
      await http()
        .post('/api/journal/sot')
        .set('Authorization', `Bearer ${chair}`)
        .send({ buildingId: fx.building.id, enabled: true, force: true, reason: 'chairman cannot force' })
        .expect(409);
      await http()
        .post('/api/journal/sot')
        .set('Authorization', `Bearer ${board}`)
        .send({ buildingId: fx.building.id, enabled: true })
        .expect(403);
    });

    it('enables after the streak, reads switch to journal, then rolls back without data loss', async () => {
      const days = Number(process.env.JOURNAL_SOT_STREAK_DAYS ?? 30);
      const now = Date.now();
      await testPrisma.journalShadowRun.createMany({
        data: Array.from({ length: days }, (_, i) => ({
          buildingId: fx.building.id,
          day: new Date(now - i * 86_400_000).toISOString().slice(0, 10),
          readyForSot: true,
          reconcileOk: true,
          advancesOk: true,
          mismatchCount: 0,
        })),
      });
      const before = await fundsSource();
      expect(before.every((s) => s === 'legacy')).toBe(true);
      const counts = async () => ({
        entries: await testPrisma.journalEntry.count(),
        payments: await testPrisma.payment.count(),
      });
      const c0 = await counts();

      const on = await http()
        .post('/api/journal/sot')
        .set('Authorization', `Bearer ${accountant}`)
        .send({ buildingId: fx.building.id, enabled: true })
        .expect(201);
      expect(on.body).toMatchObject({ journalSot: true, changed: true, forced: false });
      expect((await fundsSource()).every((s) => s === 'journal')).toBe(true);
      const readiness = await http()
        .get(`/api/journal/sot-readiness?buildingId=${fx.building.id}`)
        .set('Authorization', `Bearer ${board}`)
        .expect(200);
      expect(readiness.body).toMatchObject({ eligible: true, journalSot: true });

      const off = await http()
        .post('/api/journal/sot')
        .set('Authorization', `Bearer ${chair}`)
        .send({ buildingId: fx.building.id, enabled: false })
        .expect(201);
      expect(off.body).toMatchObject({ journalSot: false, previous: true });
      expect((await fundsSource()).every((s) => s === 'legacy')).toBe(true);
      expect(await counts()).toEqual(c0);
      const audit = await testPrisma.auditLog.findMany({
        where: { entityId: fx.building.id, action: { in: ['journal.sot_enabled', 'journal.sot_disabled'] } },
      });
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });

    it('another tenant cannot switch this building', async () => {
      const otherChair = await login('b-chairman@osbb.local');
      const r = await http()
        .post('/api/journal/sot')
        .set('Authorization', `Bearer ${otherChair}`)
        .send({ buildingId: fx.building.id, enabled: false });
      expect([403, 404]).toContain(r.status);
      const r2 = await http()
        .post('/api/journal/sot')
        .set('Authorization', `Bearer ${chair}`)
        .send({ buildingId: tenantB.building.id, enabled: false });
      expect([403, 404]).toContain(r2.status);
    });
  });
});

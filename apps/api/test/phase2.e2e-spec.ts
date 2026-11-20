import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RequestLoggingMiddleware } from '../src/common/middleware/request-logging.middleware';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { authCache } from '../src/common/auth-cache';
import {
  disconnectTestDatabase,
  resetTestDatabase,
  seedSecondTenant,
  seedTestFixtures,
  testPrisma,
} from './helpers/seed-test';

/** Phase 2: input validation (M10), NULL-tenant rows (M8), job leases (M9). */
describe('Phase 2 hardening (e2e)', () => {
  let app: INestApplication;
  let fx: Awaited<ReturnType<typeof seedTestFixtures>>;
  let chair: string;
  let resident: string;
  let tenantB: Awaited<ReturnType<typeof seedSecondTenant>>;
  const http = () => request(app.getHttpServer());
  const login = async (email: string) =>
    (await http().post('/api/auth/login').send({ email, password: 'password123' })).body
      .accessToken as string;

  beforeAll(async () => {
    await resetTestDatabase();
    fx = await seedTestFixtures();
    tenantB = await seedSecondTenant();
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    const rl = new RequestLoggingMiddleware();
    app.use(rl.use.bind(rl));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    chair = await login('test-chairman@osbb.local');
    resident = await login('test-resident@osbb.local');
  });

  afterAll(async () => {
    await testPrisma.workerJob.deleteMany().catch(() => undefined);
    await app.close();
    await disconnectTestDatabase();
  });

  describe('M10 validation of former inline bodies', () => {
    it('credit-note: non-numeric / negative amount → 400', async () => {
      const line = await testPrisma.accrualLine.findFirst({ where: { accrualId: fx.accrual.id } });
      for (const amount of ['abc', -5, 0]) {
        await http()
          .post(`/api/accruals/lines/${line!.id}/credit-note`)
          .set('Authorization', `Bearer ${chair}`)
          .send({ amount })
          .expect(400);
      }
    });
    it('password forgot: not an e-mail / unknown fields → 400', async () => {
      await http().post('/api/auth/password/forgot').send({ email: 42 }).expect(400);
      await http()
        .post('/api/auth/password/forgot')
        .send({ email: 'x@y.ua', admin: true })
        .expect(400);
    });
    it('meter reading: bad period / negative value → 400', async () => {
      const meter = await testPrisma.meter.create({
        data: { apartmentId: fx.apartment.id, type: 'cold_water', name: 'ХВ' },
      });
      await http()
        .post(`/api/meters/${meter.id}/readings/self`)
        .set('Authorization', `Bearer ${resident}`)
        .send({ period: '2026-13', value: 10 })
        .expect(400);
      await http()
        .post(`/api/meters/${meter.id}/readings/self`)
        .set('Authorization', `Bearer ${resident}`)
        .send({ period: '2026-06', value: -1 })
        .expect(400);
      await http()
        .post(`/api/meters/${meter.id}/readings/self`)
        .set('Authorization', `Bearer ${resident}`)
        .send({ period: '2026-06', value: 12.5 })
        .expect(201);
    });
    it('email-notify requires a boolean', async () => {
      await http()
        .patch('/api/auth/email-notify')
        .set('Authorization', `Bearer ${resident}`)
        .send({ enabled: 'yes' })
        .expect(400);
    });
  });

  describe('M8 rows without tenant are not shared', () => {
    it('document with NULL tenant is invisible to organization staff', async () => {
      const doc = await testPrisma.document.create({
        data: { title: 'orphan', fileKey: 'documents/orphan.pdf', isPublic: true },
      });
      const r = await http().get('/api/documents').set('Authorization', `Bearer ${chair}`).expect(200);
      expect(r.body.some((d: { id: string }) => d.id === doc.id)).toBe(false);
    });
  });

  describe('M9 job lease', () => {
    it('concurrent reminder scans: only one runs', async () => {
      const svc = app.get(RemindersService);
      const [a, b] = await Promise.all([svc.processDue(null), svc.processDue(null)]);
      expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1);
      const job = await testPrisma.workerJob.findUnique({ where: { name: 'reminders_scan:all' } });
      expect(job?.lastStatus).toBe('ok');
      expect(job?.lockedUntil).toBeNull();
      // lease released → next run proceeds
      expect((await svc.processDue(null)).skipped).toBeUndefined();
    });
  });

  describe('Ops: health probes and metrics', () => {
    it('liveness / readiness', async () => {
      await http().get('/api/health/live').expect(200);
      const r = await http().get('/api/health/ready').expect(200);
      expect(r.body.status).toBe('ok');
    });
    it('metrics (Prometheus text) and token protection', async () => {
      const r = await http().get('/api/metrics').expect(200);
      expect(r.text).toMatch(/dah_http_requests_total\{method="GET",route="\/api\/health\/live",status="2xx"\} \d+/);
      expect(r.text).toContain('dah_db_up 1');
      expect(r.text).toMatch(/dah_build_info\{version="\d+\.\d+\.\d+"\} 1/);
      process.env.METRICS_TOKEN = 'metrics-secret-token-123';
      try {
        await http().get('/api/metrics').expect(401);
        await http().get('/api/metrics').set('Authorization', 'Bearer metrics-secret-token-123').expect(200);
      } finally {
        delete process.env.METRICS_TOKEN;
      }
    });
    it('L8: invalid client request id is replaced', async () => {
      const r = await http().get('/api/health/live').set('x-request-id', 'bad id!').expect(200);
      expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const ok = await http().get('/api/health/live').set('x-request-id', 'trace-0001-abc').expect(200);
      expect(ok.headers['x-request-id']).toBe('trace-0001-abc');
    });
  });

  describe('M18: auth cache invalidation on auth-model writes', () => {
    it('any User/AuthSession write clears cached principals', async () => {
      const prisma = app.get(PrismaService);
      authCache.set('u:s', { user: {}, expires: Date.now() + 60_000 });
      await prisma.workerJob.findMany();
      expect(authCache.size).toBe(1);
      await prisma.authSession.updateMany({ where: { id: '__none__' }, data: { revokedAt: new Date() } });
      expect(authCache.size).toBe(0);
    });
  });

  describe('Roadmap: Journal SoT readiness streak', () => {
    const day = (offset: number) =>
      new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

    it('records a shadow run and reports readiness for own building', async () => {
      const rec = await http()
        .post(`/api/journal/shadow-runs?buildingId=${fx.building.id}`)
        .set('Authorization', `Bearer ${chair}`)
        .expect(201);
      expect(rec.body.day).toBe(day(0));
      const r = await http()
        .get(`/api/journal/sot-readiness?buildingId=${fx.building.id}`)
        .set('Authorization', `Bearer ${chair}`)
        .expect(200);
      expect(r.body.requiredDays).toBe(30);
      expect(r.body.lastRun.day).toBe(day(0));
      expect(r.body.streakDays).toBe(rec.body.readyForSot ? 1 : 0);
    });

    it('streak counts consecutive ready days and breaks on gaps / not-ready days', async () => {
      await testPrisma.journalShadowRun.deleteMany({ where: { buildingId: fx.building.id } });
      const mk = (offset: number, readyForSot = true) =>
        testPrisma.journalShadowRun.create({
          data: { buildingId: fx.building.id, day: day(offset), readyForSot, reconcileOk: readyForSot, advancesOk: true },
        });
      // yesterday..3 days ago ready, 4 days ago missing, 5 ready
      await Promise.all([mk(1), mk(2), mk(3), mk(5)]);
      const get = () =>
        http().get(`/api/journal/sot-readiness?buildingId=${fx.building.id}`).set('Authorization', `Bearer ${chair}`);
      expect((await get().expect(200)).body).toMatchObject({ streakDays: 3, eligible: false });
      process.env.JOURNAL_SOT_STREAK_DAYS = '3';
      try {
        expect((await get().expect(200)).body).toMatchObject({ streakDays: 3, eligible: true, requiredDays: 3 });
        await mk(0, false);
        expect((await get().expect(200)).body).toMatchObject({ streakDays: 0, eligible: false });
      } finally {
        delete process.env.JOURNAL_SOT_STREAK_DAYS;
      }
    });

    it('foreign building → 404; resident → 403', async () => {
      await http()
        .get(`/api/journal/sot-readiness?buildingId=${tenantB.building.id}`)
        .set('Authorization', `Bearer ${chair}`)
        .expect(404);
      await http()
        .get(`/api/journal/sot-readiness?buildingId=${fx.building.id}`)
        .set('Authorization', `Bearer ${resident}`)
        .expect(403);
    });
  });
});

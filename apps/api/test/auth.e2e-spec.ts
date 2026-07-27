import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestDatabase, resetTestDatabase, seedTestFixtures } from './helpers/seed-test';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetTestDatabase();
    await seedTestFixtures();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('GET /api/health returns db up', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.db).toBe('up');
        expect(['ok', 'degraded']).toContain(res.body.status);
      });
  });

  it('POST /api/auth/login returns token for chairman', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' })
      .expect((res) => expect([200, 201]).toContain(res.status))
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.refreshToken).toBeDefined();
        expect(res.body.user.role).toBe('chairman');
      });
  });

  it('POST /api/auth/login rejects invalid password', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'wrongpass' })
      .expect(401);
  });

  it('GET /api/auth/me requires auth', () => {
    return request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('refresh rotates token; reuse of old refresh is rejected', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    expect([200, 201]).toContain(login.status);
    const firstRefresh = login.body.refreshToken as string;

    const rotated = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefresh });
    expect([200, 201]).toContain(rotated.status);
    expect(rotated.body.accessToken).toBeDefined();
    expect(rotated.body.refreshToken).toBeDefined();
    expect(rotated.body.refreshToken).not.toBe(firstRefresh);

    const reuse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);

    // New token still works after family not fully burned... actually reuse revokes family
    const afterReuse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('logout-all invalidates refresh', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    const access = login.body.accessToken as string;
    const refresh = login.body.refreshToken as string;

    await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${access}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh })
      .expect(401);
  });
});
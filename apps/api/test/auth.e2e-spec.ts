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

  it('GET /api/health returns ok', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('POST /api/auth/login returns token for chairman', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' })
      .expect((res) => expect([200, 201]).toContain(res.status))
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
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
});
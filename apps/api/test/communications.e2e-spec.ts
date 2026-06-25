import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestDatabase, resetTestDatabase, seedTestFixtures } from './helpers/seed-test';

describe('Communications (e2e)', () => {
  let app: INestApplication;
  let residentToken: string;
  let pollId: string;
  let optionId: string;

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

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-resident@osbb.local', password: 'password123' });
    residentToken = login.body.accessToken;

    const chairmanLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    const chairmanToken = chairmanLogin.body.accessToken;

    const poll = await request(app.getHttpServer())
      .post('/api/communications/polls')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .send({
        question: 'Test poll?',
        options: ['Yes', 'No'],
      });
    pollId = poll.body.id;
    optionId = poll.body.options[0].id;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('allows resident to vote once', async () => {
    await request(app.getHttpServer())
      .post(`/api/communications/polls/${pollId}/vote`)
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ optionId })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('rejects duplicate vote', async () => {
    await request(app.getHttpServer())
      .post(`/api/communications/polls/${pollId}/vote`)
      .set('Authorization', `Bearer ${residentToken}`)
      .send({ optionId })
      .expect(403);
  });
});
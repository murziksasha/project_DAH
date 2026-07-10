import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestDatabase, resetTestDatabase, seedTestFixtures, testPrisma } from './helpers/seed-test';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let apartmentId: string;
  let residentId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    const fixtures = await seedTestFixtures();
    apartmentId = fixtures.apartment.id;
    residentId = fixtures.resident.id;

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
      .send({ email: 'test-admin@osbb.local', password: 'password123' });
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('GET /api/users returns paginated list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users?page=1&limit=20')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.page).toBe(1);
  });

  it('GET /api/users?search=resident finds resident', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users?search=resident')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.items.some((u: { email: string }) => u.email === 'test-resident@osbb.local')).toBe(true);
  });

  it('PATCH /api/users/:id updates profile and links multiple apartments', async () => {
    const apt2 = await testPrisma.apartment.create({
      data: {
        buildingId: (await testPrisma.building.findFirst())!.id,
        number: '102',
        entrance: 1,
        area: 48,
      },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/users/${residentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Updated',
        apartmentIds: [apartmentId, apt2.id],
        primaryApartmentId: apt2.id,
      })
      .expect(200);

    expect(res.body.firstName).toBe('Updated');
    expect(res.body.apartments).toHaveLength(2);
    expect(res.body.apartmentId).toBe(apt2.id);

    const links = await testPrisma.userApartment.findMany({ where: { userId: residentId } });
    expect(links).toHaveLength(2);
  });

  it('POST /api/users/:id/apartments/:apartmentId links apartment', async () => {
    const apt3 = await testPrisma.apartment.create({
      data: {
        buildingId: (await testPrisma.building.findFirst())!.id,
        number: '103',
        entrance: 1,
        area: 52,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/users/${residentId}/apartments/${apt3.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const links = await testPrisma.userApartment.findMany({ where: { userId: residentId } });
    expect(links.some((l) => l.apartmentId === apt3.id)).toBe(true);
  });

  it('PATCH /api/users/:id/block and unblock via status', async () => {
    await request(app.getHttpServer())
      .patch(`/api/users/${residentId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/users/${residentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);
  });
});
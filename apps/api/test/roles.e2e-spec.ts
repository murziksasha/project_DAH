import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestDatabase, resetTestDatabase, seedTestFixtures } from './helpers/seed-test';

const TENANT = 'test_tenant';

describe('Roles catalog (e2e) — super_admin', () => {
  let app: INestApplication;
  let superToken: string;
  let chairmanToken: string;

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

    const superLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-admin@osbb.local', password: 'password123' });
    superToken = superLogin.body.accessToken;
    expect(superToken).toBeDefined();

    const chairLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    chairmanToken = chairLogin.body.accessToken;
    expect(chairmanToken).toBeDefined();
  });

  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  function rolesAsSuper(method: 'get' | 'post' | 'patch' | 'delete', path = '/api/roles') {
    const req = request(app.getHttpServer())[method](path)
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Tenant-Id', TENANT);
    return req;
  }

  it('GET /api/roles without X-Tenant-Id fails for super_admin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${superToken}`)
      .expect(400);

    expect(res.body.message || res.body.code || JSON.stringify(res.body)).toMatch(
      /tenant|організац/i,
    );
  });

  it('GET /api/roles lists catalog for tenant', async () => {
    const res = await rolesAsSuper('get').expect(200);
    expect(res.body.items).toBeInstanceOf(Array);
    const codes = res.body.items.map((r: { code: string }) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['chairman', 'resident', 'accountant']));
    expect(res.body.items.some((r: { code: string; canDelete?: boolean }) => r.code === 'chairman' && r.canDelete === false)).toBe(
      true,
    );
  });

  it('DELETE optional role with 0 members removes it; GET does not reseed', async () => {
    // board has 0 members in fixtures
    await rolesAsSuper('delete', '/api/roles/board').expect(200);

    const afterDelete = await rolesAsSuper('get').expect(200);
    const codes = afterDelete.body.items.map((r: { code: string }) => r.code);
    expect(codes).not.toContain('board');

    // Second list must still omit board (ensureCatalog must not restore optional roles)
    const again = await rolesAsSuper('get').expect(200);
    expect(again.body.items.map((r: { code: string }) => r.code)).not.toContain('board');
  });

  it('POST /api/roles re-adds deleted optional role', async () => {
    const res = await rolesAsSuper('post')
      .send({ code: 'board' })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const codes = res.body.items.map((r: { code: string }) => r.code);
    expect(codes).toContain('board');
    const row = res.body.items.find((r: { code: string }) => r.code === 'board');
    expect(row.isActive).toBe(true);
  });

  it('DELETE protected chairman/resident is rejected', async () => {
    await rolesAsSuper('delete', '/api/roles/chairman').expect(400);
    await rolesAsSuper('delete', '/api/roles/resident').expect(400);
  });

  it('DELETE role with members is rejected', async () => {
    // accountant has membership in fixtures
    await rolesAsSuper('delete', '/api/roles/accountant').expect(400);
  });

  it('PATCH deactivate prevents assigning role to new users', async () => {
    await rolesAsSuper('patch', '/api/roles/dispatcher')
      .send({ isActive: false })
      .expect(200);

    const create = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Tenant-Id', TENANT)
      .send({
        email: 'dispatch-blocked@osbb.local',
        password: 'password123',
        firstName: 'Disp',
        lastName: 'Blocked',
        role: UserRole.dispatcher,
      });

    expect(create.status).toBe(400);

    await rolesAsSuper('patch', '/api/roles/dispatcher')
      .send({ isActive: true })
      .expect(200);
  });

  it('chairman can GET roles but not POST/DELETE', async () => {
    await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .send({ code: 'crew' })
      .expect(403);

    await request(app.getHttpServer())
      .delete('/api/roles/crew')
      .set('Authorization', `Bearer ${chairmanToken}`)
      .expect(403);
  });

  it('POST create user with role missing from catalog is rejected', async () => {
    await rolesAsSuper('delete', '/api/roles/crew').expect(200);

    const create = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Tenant-Id', TENANT)
      .send({
        email: 'crew-missing@osbb.local',
        password: 'password123',
        firstName: 'Crew',
        lastName: 'Missing',
        role: UserRole.crew,
      });
    expect(create.status).toBe(400);

    // restore
    await rolesAsSuper('post').send({ code: 'crew' }).expect((r) => expect([200, 201]).toContain(r.status));
  });
});

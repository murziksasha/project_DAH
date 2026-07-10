import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FundType, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestDatabase, resetTestDatabase, testPrisma } from './helpers/seed-test';

const SUPER_EMAIL = 'setup-super@osbb.local';
const SUPER_PASSWORD = 'password123';

async function seedSuperAdminOnly() {
  const passwordHash = await bcrypt.hash(SUPER_PASSWORD, 4);
  await testPrisma.user.create({
    data: {
      email: SUPER_EMAIL,
      passwordHash,
      firstName: 'Setup',
      lastName: 'Admin',
      role: UserRole.super_admin,
      status: UserStatus.active,
    },
  });
}

async function loginSuper(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: SUPER_EMAIL, password: SUPER_PASSWORD });
  expect(res.body.accessToken).toBeDefined();
  return res.body.accessToken;
}

describe('Setup (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    await resetTestDatabase();
    await seedSuperAdminOnly();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    token = await loginSuper(app);
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('GET /api/setup/status starts at step 0', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.nextStep).toBe(0);
    expect(res.body.stepDone).toEqual({
      building: false,
      bank: false,
      apartments: false,
      users: false,
    });
    expect(res.body.canComplete).toBe(false);
  });

  it('completes full setup flow', async () => {
    await request(app.getHttpServer())
      .post('/api/setup/building')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test OSBB', address: 'Test st. 1', edrpou: '12345678' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/setup/bank')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankName: 'ПриватБанк',
        iban: 'UA123456789012345678901234567',
        description: 'Main',
        funds: [
          { name: 'Фонд утримання', type: 'maintenance', openingBalance: 0 },
          { name: 'Фонд капітального ремонту', type: 'capital_repair', openingBalance: 0 },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/setup/apartments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        apartments: [{ number: '101', entrance: 1, floor: 5, area: 52.5 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/setup/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        users: [
          {
            email: 'chair@osbb.local',
            password: 'password123',
            firstName: 'Head',
            lastName: 'Chair',
            role: 'chairman',
          },
          {
            email: 'acc@osbb.local',
            password: 'password123',
            firstName: 'Acc',
            lastName: 'Count',
            role: 'accountant',
          },
          {
            email: 'aud@osbb.local',
            password: 'password123',
            firstName: 'Aud',
            lastName: 'Itor',
            role: 'auditor',
          },
        ],
      })
      .expect(201);

    const status = await request(app.getHttpServer())
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.nextStep).toBe(4);
    expect(status.body.canComplete).toBe(true);
    expect(status.body.stepDone.bank).toBe(true);

    await request(app.getHttpServer())
      .post('/api/setup/complete')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const after = await request(app.getHttpServer())
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(after.body.isInitialized).toBe(true);
  });
});

describe('Setup defer roles (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    await resetTestDatabase();
    await seedSuperAdminOnly();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    token = await loginSuper(app);
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('completes setup when accountant and auditor are deferred', async () => {
    await request(app.getHttpServer())
      .post('/api/setup/building')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Defer OSBB', address: 'Defer st.', edrpou: '11111111' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/setup/bank')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankName: 'ПриватБанк',
        iban: 'UA111111111111111111111111111',
        funds: [
          { name: 'Фонд утримання', type: 'maintenance', openingBalance: 0 },
          { name: 'Фонд капітального ремонту', type: 'capital_repair', openingBalance: 0 },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/setup/apartments')
      .set('Authorization', `Bearer ${token}`)
      .send({ apartments: [{ number: '101', entrance: 1, area: 50 }] })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/setup/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        users: [
          {
            email: 'chair-only@osbb.local',
            password: 'password123',
            firstName: 'Only',
            lastName: 'Chair',
            role: 'chairman',
          },
        ],
        deferRoles: ['accountant', 'auditor'],
      })
      .expect(201);

    const status = await request(app.getHttpServer())
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.canComplete).toBe(true);
    expect(status.body.pendingDeferredRoles).toEqual(['accountant', 'auditor']);
    expect(status.body.deferredSetupRoles).toEqual(['accountant', 'auditor']);

    await request(app.getHttpServer())
      .post('/api/setup/complete')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'late-acc@osbb.local',
        password: 'password123',
        firstName: 'Late',
        lastName: 'Acc',
        role: 'accountant',
      })
      .expect(201);

    const afterAcc = await request(app.getHttpServer())
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterAcc.body.pendingDeferredRoles).toEqual(['auditor']);
  });
});

describe('Setup resume (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    await resetTestDatabase();
    await seedSuperAdminOnly();

    const building = await testPrisma.building.create({
      data: { name: 'Partial OSBB', address: 'Partial st.', isInitialized: false, settings: {} },
    });

    const bankAccount = await testPrisma.bankAccount.create({
      data: {
        buildingId: building.id,
        bankName: 'ПриватБанк',
        iban: 'UA999999999999999999999999999',
        description: 'Existing',
      },
    });

    await testPrisma.fund.createMany({
      data: [
        {
          buildingId: building.id,
          bankAccountId: bankAccount.id,
          type: FundType.maintenance,
          name: 'Фонд утримання',
          openingBalance: 0,
        },
        {
          buildingId: building.id,
          bankAccountId: bankAccount.id,
          type: FundType.capital_repair,
          name: 'Фонд капітального ремонту',
          openingBalance: 0,
        },
      ],
    });

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    token = await loginSuper(app);
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('GET /api/setup/status resumes at apartments step', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.nextStep).toBe(2);
    expect(res.body.stepDone.bank).toBe(true);
    expect(res.body.bankAccount).toMatchObject({
      bankName: 'ПриватБанк',
      iban: 'UA999999999999999999999999999',
    });
  });

  it('POST /api/setup/bank is idempotent when funds exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/setup/bank')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankName: 'ПриватБанк',
        iban: 'UA000000000000000000000000000',
        funds: [
          { name: 'Фонд утримання', type: 'maintenance', openingBalance: 0 },
          { name: 'Фонд капітального ремонту', type: 'capital_repair', openingBalance: 0 },
        ],
      })
      .expect(201);

    expect(res.body.skipped).toBe(true);
    expect(res.body.funds).toHaveLength(2);
  });

  it('POST /api/setup/users creates only missing roles when chairman exists', async () => {
    const passwordHash = await bcrypt.hash('password123', 4);
    await testPrisma.user.create({
      data: {
        email: 'existing-chair@osbb.local',
        passwordHash,
        firstName: 'Existing',
        lastName: 'Chair',
        role: UserRole.chairman,
        status: UserStatus.active,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/setup/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        users: [
          {
            email: 'new-acc@osbb.local',
            password: 'password123',
            firstName: 'Acc',
            lastName: 'New',
            role: 'accountant',
          },
          {
            email: 'new-aud@osbb.local',
            password: 'password123',
            firstName: 'Aud',
            lastName: 'New',
            role: 'auditor',
          },
        ],
      })
      .expect(201);

    expect(res.body.skipped).toBe(false);
    expect(res.body.users).toHaveLength(3);

    const status = await request(app.getHttpServer())
      .get('/api/setup/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.existingUsers.chairman?.email).toBe('existing-chair@osbb.local');
    expect(status.body.hasChairman).toBe(true);
    expect(status.body.hasAccountant).toBe(true);
    expect(status.body.hasAuditor).toBe(true);
  });

  it('POST /api/setup/apartments rejects duplicate batch', async () => {
    await request(app.getHttpServer())
      .post('/api/setup/apartments')
      .set('Authorization', `Bearer ${token}`)
      .send({ apartments: [{ number: '101', entrance: 1, area: 50 }] })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/setup/apartments')
      .set('Authorization', `Bearer ${token}`)
      .send({ apartments: [{ number: '102', entrance: 1, area: 48 }] })
      .expect(400);
  });
});
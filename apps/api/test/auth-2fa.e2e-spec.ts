import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  disconnectTestDatabase,
  resetTestDatabase,
  seedTestFixtures,
  testPrisma,
} from './helpers/seed-test';

function currentTotp(secretB32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = secretB32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const secret = Buffer.from(out);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}

describe('Auth 2FA (e2e)', () => {
  let app: INestApplication;
  let token: string;

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
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('setup + enable 2FA then requires code on login', async () => {
    const setup = await request(app.getHttpServer())
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(setup.status);
    expect(setup.body.secret).toBeTruthy();
    expect(setup.body.otpauthUrl).toContain('otpauth://');

    const code = currentTotp(setup.body.secret);
    const enabled = await request(app.getHttpServer())
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    expect([200, 201]).toContain(enabled.status);

    const user = await testPrisma.user.findUnique({
      where: { email: 'test-chairman@osbb.local' },
    });
    expect(user?.totpEnabled).toBe(true);

    const step1 = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'test-chairman@osbb.local', password: 'password123' });
    expect([200, 201]).toContain(step1.status);
    expect(step1.body.requires2fa).toBe(true);
    expect(step1.body.tempToken).toBeTruthy();
    expect(step1.body.accessToken).toBeUndefined();

    const code2 = currentTotp(user!.totpSecret!);
    const step2 = await request(app.getHttpServer())
      .post('/api/auth/2fa/verify')
      .send({ tempToken: step1.body.tempToken, code: code2 });
    expect([200, 201]).toContain(step2.status);
    expect(step2.body.accessToken).toBeTruthy();
  });
});

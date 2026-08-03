import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KepService } from './kep.service';

describe('KepService', () => {
  let service: KepService;
  const sessions = new Map<string, Record<string, unknown>>();

  const prisma = {
    signSession: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        sessions.set(data.id as string, { ...data, createdAt: new Date() });
        return data;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const s = sessions.get(where.id);
        if (!s) return null;
        return {
          ...s,
          expiresAt: s.expiresAt instanceof Date ? s.expiresAt : new Date(s.expiresAt as string),
          completedAt: s.completedAt ?? null,
          createdAt: s.createdAt ?? new Date(),
        };
      }),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const prev = sessions.get(where.id) ?? {};
        const next = { ...prev, ...data };
        sessions.set(where.id, next);
        return {
          ...next,
          expiresAt: next.expiresAt instanceof Date ? next.expiresAt : new Date(String(next.expiresAt)),
          completedAt: next.completedAt ?? new Date(),
          createdAt: next.createdAt ?? new Date(),
        };
      }),
    },
    meetingSignature: {
      upsert: jest.fn(async () => ({})),
    },
  };

  const configMap: Record<string, string> = {
    KEP_ENABLED: 'true',
    KEP_PROVIDER: 'mock',
    KEP_ALLOW_MOCK: 'true',
    KEP_MOCK_INSTANT: 'false',
    APP_URL: 'http://localhost:3000',
    API_PORT: '3001',
  };

  beforeEach(async () => {
    sessions.clear();
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        KepService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: (k: string, d?: string) => configMap[k] ?? d },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(KepService);
  });

  it('status reports mock provider', () => {
    const s = service.status();
    expect(s.enabled).toBe(true);
    expect(s.provider).toBe('mock');
    expect(s.providers).toContain('diia');
  });

  it('digestDocument is stable SHA-256', () => {
    expect(service.digestDocument('hello')).toBe(service.digestDocument('hello'));
    expect(service.digestDocument('hello')).not.toBe(service.digestDocument('world'));
  });

  it('startSession mock returns authorizeUrl', async () => {
    const r = await service.startSession({
      purpose: 'meeting_protocol',
      refType: 'Meeting',
      refId: 'm1',
      userId: 'u1',
      documentTitle: 'Test',
      documentText: 'Protocol body',
      provider: 'mock',
    });
    expect(r.signed).toBe(false);
    expect(r.sessionId).toBeTruthy();
    expect(r.authorizeUrl).toContain('/kep/mock/authorize');
    expect(r.digest).toHaveLength(64);
  });

  it('completeSession mock marks signed', async () => {
    const r = await service.startSession({
      purpose: 'meeting_protocol',
      refType: 'Meeting',
      refId: 'm1',
      userId: 'u1',
      documentTitle: 'Test',
      documentText: 'Protocol body',
      provider: 'mock',
    });
    const done = await service.completeSession({ sessionId: r.sessionId, code: 'mock_ok' });
    expect(done.signed).toBe(true);
    expect(done.status).toBe('signed');
  });

  it('webhook requires secret in production-like config', async () => {
    configMap.KEP_WEBHOOK_SECRET = 'sec';
    configMap.NODE_ENV = 'production';
    await expect(service.handleWebhook({ sessionId: 'x' }, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    delete configMap.KEP_WEBHOOK_SECRET;
    delete configMap.NODE_ENV;
  });

  it('rejects unknown provider', async () => {
    await expect(
      service.startSession({
        purpose: 'x',
        refType: 'Meeting',
        refId: 'm',
        userId: 'u',
        documentTitle: 't',
        documentText: 'b',
        provider: 'nope' as 'mock',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

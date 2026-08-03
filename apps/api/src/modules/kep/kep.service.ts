import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CompleteSignInput,
  DiiaOfferResponse,
  KEP_PROVIDERS,
  KepProvider,
  StartSignInput,
  StartSignResult,
} from './kep.types';

/**
 * Qualified electronic signature (КЕП) + Дія.Підпис.
 *
 * Providers:
 * - mock — local demo (instant or browser mock page)
 * - diia — Diia.Підпис acquirer API (offer + deeplink + webhook)
 * - cloud_kep — generic cloud QES (OAuth authorize + callback)
 * - cades — client uploads CAdES/CMS (EUSign / token)
 *
 * Env: KEP_ENABLED, KEP_PROVIDER, KEP_WEBHOOK_SECRET, KEP_DIIA_*, KEP_CLOUD_*
 */
@Injectable()
export class KepService {
  private readonly logger = new Logger(KepService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('KEP_ENABLED', 'true') === 'true';
  }

  defaultProvider(): KepProvider {
    const p = (this.config.get('KEP_PROVIDER', 'mock') || 'mock') as KepProvider;
    return KEP_PROVIDERS.includes(p) ? p : 'mock';
  }

  status() {
    const provider = this.defaultProvider();
    const diiaConfigured = Boolean(
      this.config.get('KEP_DIIA_ACQUIRER_TOKEN') || this.config.get('KEP_DIIA_API_KEY'),
    );
    const cloudConfigured = Boolean(
      this.config.get('KEP_CLOUD_AUTHORIZE_URL') && this.config.get('KEP_CLOUD_CLIENT_ID'),
    );
    return {
      enabled: this.isEnabled(),
      provider,
      providers: KEP_PROVIDERS,
      mockAllowed: this.config.get('KEP_ALLOW_MOCK', 'true') === 'true',
      diiaConfigured,
      cloudConfigured,
      productionReady:
        this.isEnabled() &&
        ((provider === 'diia' && diiaConfigured) ||
          (provider === 'cloud_kep' && cloudConfigured) ||
          provider === 'cades' ||
          (provider === 'mock' && this.config.get('NODE_ENV') !== 'production')),
      webhookPath: '/api/kep/webhook',
      docs: 'https://integration.diia.gov.ua/signature.html',
    };
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('КЕП вимкнено (KEP_ENABLED=false)');
    }
  }

  /** Canonical digest of document text (SHA-256 hex). */
  digestDocument(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  async startSession(input: StartSignInput): Promise<StartSignResult> {
    this.assertEnabled();
    let provider = input.provider ?? this.defaultProvider();
    if (provider === 'mock' && this.config.get('KEP_ALLOW_MOCK', 'true') !== 'true') {
      throw new BadRequestException('Mock-підпис вимкнено (KEP_ALLOW_MOCK=false)');
    }
    if (!KEP_PROVIDERS.includes(provider)) {
      throw new BadRequestException(`Невідомий provider. Доступні: ${KEP_PROVIDERS.join(', ')}`);
    }

    const digest = this.digestDocument(input.documentText);
    const challenge = randomBytes(16).toString('hex');
    const ttlMin = Number(this.config.get('KEP_SESSION_TTL_MIN', '30')) || 30;
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);
    const sessionId = randomUUID();

    let authorizeUrl: string | null = null;
    let deeplink: string | null = null;
    let externalSessionId: string | null = null;
    let status = 'waiting_user';
    let signed = false;
    let signatureCms: string | null = null;
    let resultPayload: Record<string, unknown> = {};
    let message = '';

    const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    const apiPort = this.config.get('API_PORT', '3001');
    const apiPublic =
      this.config.get('API_PUBLIC_URL') ??
      this.config.get('NEXT_PUBLIC_API_URL') ??
      `http://localhost:${apiPort}/api`;

    if (provider === 'mock') {
      const instant = this.config.get('KEP_MOCK_INSTANT', 'false') === 'true';
      if (instant) {
        status = 'signed';
        signed = true;
        signatureCms = Buffer.from(
          JSON.stringify({ mock: true, digest, challenge, ts: Date.now() }),
        ).toString('base64');
        resultPayload = {
          method: 'mock-instant',
          digest,
          note: 'Миттєвий mock-підпис (KEP_MOCK_INSTANT=true)',
        };
        message = 'Документ підписано (mock instant)';
      } else {
        authorizeUrl = `${apiPublic.replace(/\/$/, '')}/kep/mock/authorize?sessionId=${sessionId}`;
        message = 'Відкрийте authorizeUrl для демо-підпису (mock IdP)';
      }
    } else if (provider === 'diia') {
      const offer = await this.createDiiaOffer({
        sessionId,
        digest,
        documentTitle: input.documentTitle,
        returnUrl: input.returnUrl ?? `${appUrl}/resident/meetings?kepSession=${sessionId}`,
      });
      externalSessionId = offer.requestId ?? sessionId;
      deeplink = offer.deeplink ?? offer.deepLink ?? null;
      authorizeUrl = offer.url ?? deeplink;
      resultPayload = { diia: offer };
      message = deeplink
        ? 'Відкрийте deeplink у застосунку Дія для підпису'
        : 'Diia offer створено — очікуємо webhook / callback';
    } else if (provider === 'cloud_kep') {
      const cloud = this.buildCloudAuthorizeUrl({
        sessionId,
        digest,
        documentTitle: input.documentTitle,
        returnUrl: input.returnUrl ?? `${appUrl}/resident/meetings?kepSession=${sessionId}`,
      });
      authorizeUrl = cloud.authorizeUrl;
      externalSessionId = cloud.state;
      message = 'Перейдіть за authorizeUrl до хмарного КЕП-провайдера';
    } else if (provider === 'cades') {
      message =
        'Згенеруйте CAdES-підпис digest на клієнті (EUSign) і надішліть POST /api/kep/sessions/:id/complete';
      resultPayload = { digest, algorithm: 'SHA-256', encoding: 'hex' };
    }

    await this.prisma.signSession.create({
      data: {
        id: sessionId,
        purpose: input.purpose,
        refType: input.refType,
        refId: input.refId,
        userId: input.userId,
        provider,
        status: signed ? 'signed' : status,
        digest,
        documentTitle: input.documentTitle,
        documentText: input.documentText.slice(0, 200_000),
        challenge,
        externalSessionId,
        authorizeUrl,
        deeplink,
        signatureCms,
        resultPayload: resultPayload as Prisma.InputJsonValue,
        expiresAt,
        completedAt: signed ? new Date() : null,
      },
    });

    await this.audit.log({
      userId: input.userId,
      action: 'kep.session_started',
      entityType: 'SignSession',
      entityId: sessionId,
      payload: { provider, purpose: input.purpose, refType: input.refType, refId: input.refId },
    });

    if (signed && input.refType === 'Meeting') {
      await this.applyMeetingSignature(sessionId);
    }

    return {
      sessionId,
      provider,
      status: signed ? 'signed' : (status as StartSignResult['status']),
      digest,
      authorizeUrl,
      deeplink,
      signed,
      message,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async getSession(sessionId: string, userId?: string) {
    const session = await this.prisma.signSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Сесію підпису не знайдено');
    if (userId && session.userId !== userId) {
      throw new ForbiddenException('Немає доступу до цієї сесії');
    }
    if (session.status === 'waiting_user' || session.status === 'pending') {
      if (session.expiresAt.getTime() < Date.now()) {
        const expired = await this.prisma.signSession.update({
          where: { id: sessionId },
          data: { status: 'expired', errorMessage: 'Сесія прострочена' },
        });
        return this.publicSession(expired);
      }
    }
    return this.publicSession(session);
  }

  private publicSession(session: {
    id: string;
    purpose: string;
    refType: string;
    refId: string;
    provider: string;
    status: string;
    digest: string;
    documentTitle: string;
    authorizeUrl: string | null;
    deeplink: string | null;
    certificateSubject: string | null;
    certificateSerial: string | null;
    errorMessage: string | null;
    expiresAt: Date;
    completedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      sessionId: session.id,
      purpose: session.purpose,
      refType: session.refType,
      refId: session.refId,
      provider: session.provider,
      status: session.status,
      digest: session.digest,
      documentTitle: session.documentTitle,
      authorizeUrl: session.authorizeUrl,
      deeplink: session.deeplink,
      certificateSubject: session.certificateSubject,
      certificateSerial: session.certificateSerial,
      errorMessage: session.errorMessage,
      expiresAt: session.expiresAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      signed: session.status === 'signed',
    };
  }

  async completeSession(input: CompleteSignInput, actorUserId?: string) {
    this.assertEnabled();
    const session = await this.prisma.signSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw new NotFoundException('Сесію не знайдено');
    if (actorUserId && session.userId !== actorUserId) {
      throw new ForbiddenException('Немає доступу');
    }
    if (session.status === 'signed') {
      return this.publicSession(session);
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.signSession.update({
        where: { id: session.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Сесія прострочена — почніть підпис знову');
    }

    if (session.provider === 'cades' || input.signatureCms) {
      if (!input.signatureCms?.trim()) {
        throw new BadRequestException('Для cades потрібен signatureCms (base64)');
      }
      // Basic sanity: non-empty base64, optional verify hook
      if (input.signatureCms.length < 32) {
        throw new BadRequestException('signatureCms занадто короткий');
      }
      return this.markSigned(session.id, {
        signatureCms: input.signatureCms,
        certificateSubject: input.certificateSubject,
        certificateSerial: input.certificateSerial,
        resultPayload: {
          method: 'cades-upload',
          ...(input.providerPayload ?? {}),
        },
      });
    }

    if (session.provider === 'mock') {
      const cms = Buffer.from(
        JSON.stringify({
          mock: true,
          digest: session.digest,
          challenge: session.challenge,
          code: input.code,
          ts: Date.now(),
        }),
      ).toString('base64');
      return this.markSigned(session.id, {
        signatureCms: cms,
        certificateSubject: 'Mock QES / Демо-сертифікат',
        certificateSerial: `MOCK-${session.challenge.slice(0, 8)}`,
        resultPayload: { method: 'mock-complete', code: input.code ?? 'mock_ok' },
      });
    }

    if (session.provider === 'cloud_kep' && input.code) {
      const tokenResult = await this.exchangeCloudCode(input.code, session.id);
      return this.markSigned(session.id, {
        signatureCms: tokenResult.signatureCms,
        certificateSubject: tokenResult.certificateSubject,
        certificateSerial: tokenResult.certificateSerial,
        resultPayload: tokenResult.raw,
      });
    }

    if (session.provider === 'diia' && input.code) {
      // Some Diia flows return via redirect with requestId
      return this.markSigned(session.id, {
        signatureCms: input.signatureCms ?? Buffer.from(input.code).toString('base64'),
        certificateSubject: input.certificateSubject ?? 'Дія.Підпис',
        resultPayload: {
          method: 'diia-code',
          code: input.code,
          ...(input.providerPayload ?? {}),
        },
      });
    }

    throw new BadRequestException(
      'Неможливо завершити: для diia/cloud очікуйте webhook або передайте code/signatureCms',
    );
  }

  /**
   * Provider webhook (Diia / cloud). Auth via KEP_WEBHOOK_SECRET header or HMAC body.
   */
  async handleWebhook(
    body: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    this.assertEnabled();
    this.verifyWebhookAuth(body, headers);

    const externalId = String(
      body.requestId ?? body.externalSessionId ?? body.sessionId ?? body.orderId ?? '',
    );
    const localSessionId = String(body.localSessionId ?? body.state ?? body.session_id ?? '');

    let session = localSessionId
      ? await this.prisma.signSession.findUnique({ where: { id: localSessionId } })
      : null;
    if (!session && externalId) {
      session = await this.prisma.signSession.findFirst({
        where: { externalSessionId: externalId },
      });
    }
    if (!session) {
      throw new NotFoundException('SignSession для webhook не знайдено');
    }

    const status = String(body.status ?? body.result ?? 'success').toLowerCase();
    if (['failed', 'error', 'cancelled', 'rejected'].includes(status)) {
      await this.prisma.signSession.update({
        where: { id: session.id },
        data: {
          status: 'failed',
          errorMessage: String(body.error ?? body.message ?? status),
          resultPayload: body as Prisma.InputJsonValue,
        },
      });
      return { ok: false, sessionId: session.id, status: 'failed' };
    }

    const signatureCms =
      typeof body.signature === 'string'
        ? body.signature
        : typeof body.signatureCms === 'string'
          ? body.signatureCms
          : typeof body.signedData === 'string'
            ? body.signedData
            : Buffer.from(JSON.stringify(body)).toString('base64');

    await this.markSigned(session.id, {
      signatureCms,
      certificateSubject:
        typeof body.certificateSubject === 'string'
          ? body.certificateSubject
          : typeof body.ownerName === 'string'
            ? body.ownerName
            : 'КЕП / Дія.Підпис',
      certificateSerial:
        typeof body.certificateSerial === 'string'
          ? body.certificateSerial
          : typeof body.serial === 'string'
            ? body.serial
            : undefined,
      resultPayload: { webhook: body },
    });

    return { ok: true, sessionId: session.id, status: 'signed' };
  }

  private async markSigned(
    sessionId: string,
    data: {
      signatureCms?: string | null;
      certificateSubject?: string | null;
      certificateSerial?: string | null;
      resultPayload?: Record<string, unknown>;
    },
  ) {
    const updated = await this.prisma.signSession.update({
      where: { id: sessionId },
      data: {
        status: 'signed',
        signatureCms: data.signatureCms ?? undefined,
        certificateSubject: data.certificateSubject ?? undefined,
        certificateSerial: data.certificateSerial ?? undefined,
        resultPayload: (data.resultPayload ?? {}) as Prisma.InputJsonValue,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    await this.audit.log({
      userId: updated.userId,
      action: 'kep.session_signed',
      entityType: 'SignSession',
      entityId: sessionId,
      payload: {
        provider: updated.provider,
        refType: updated.refType,
        refId: updated.refId,
      },
    });

    if (updated.refType === 'Meeting') {
      await this.applyMeetingSignature(sessionId);
    }

    return this.publicSession(updated);
  }

  /** Mirror SignSession → MeetingSignature when purpose is meeting. */
  async applyMeetingSignature(sessionId: string) {
    const session = await this.prisma.signSession.findUnique({ where: { id: sessionId } });
    if (!session || session.refType !== 'Meeting' || session.status !== 'signed') return null;

    return this.prisma.meetingSignature.upsert({
      where: {
        meetingId_userId: { meetingId: session.refId, userId: session.userId },
      },
      create: {
        meetingId: session.refId,
        userId: session.userId,
        provider: session.provider,
        status: 'signed',
        sessionId: session.id,
        signedAt: session.completedAt ?? new Date(),
        signaturePayload: {
          digest: session.digest,
          certificateSubject: session.certificateSubject,
          certificateSerial: session.certificateSerial,
          hasCms: Boolean(session.signatureCms),
          result: session.resultPayload,
        },
      },
      update: {
        provider: session.provider,
        status: 'signed',
        sessionId: session.id,
        signedAt: session.completedAt ?? new Date(),
        signaturePayload: {
          digest: session.digest,
          certificateSubject: session.certificateSubject,
          certificateSerial: session.certificateSerial,
          hasCms: Boolean(session.signatureCms),
          result: session.resultPayload,
        },
      },
    });
  }

  private async createDiiaOffer(args: {
    sessionId: string;
    digest: string;
    documentTitle: string;
    returnUrl: string;
  }): Promise<DiiaOfferResponse> {
    const offerUrl =
      this.config.get('KEP_DIIA_OFFER_URL') ??
      this.config.get('KEP_DIIA_API_URL') ??
      '';
    const token =
      this.config.get('KEP_DIIA_ACQUIRER_TOKEN') ?? this.config.get('KEP_DIIA_API_KEY') ?? '';

    if (!offerUrl || !token) {
      // Graceful degradation: mock deeplink so UI/flow can be tested without credentials
      this.logger.warn(
        'Diia offer: KEP_DIIA_OFFER_URL / token missing — using mock deeplink. Register at integration.diia.gov.ua',
      );
      const apiPublic =
        this.config.get('API_PUBLIC_URL') ??
        `http://localhost:${this.config.get('API_PORT', '3001')}/api`;
      return {
        requestId: `diia-mock-${args.sessionId.slice(0, 8)}`,
        deeplink: `${apiPublic.replace(/\/$/, '')}/kep/mock/authorize?sessionId=${args.sessionId}&provider=diia`,
        url: `${apiPublic.replace(/\/$/, '')}/kep/mock/authorize?sessionId=${args.sessionId}&provider=diia`,
      };
    }

    const branchId = this.config.get('KEP_DIIA_BRANCH_ID', '');
    const payload = {
      branchId: branchId || undefined,
      returnLink: args.returnUrl,
      signAlgo: this.config.get('KEP_DIIA_SIGN_ALGO', 'DSTU'),
      externalRequestId: args.sessionId,
      offer: {
        name: args.documentTitle,
        returnLink: args.returnUrl,
        data: {
          hashedFilesSigning: {
            hashedFiles: [
              {
                fileName: `${args.documentTitle.slice(0, 80)}.txt`,
                fileHash: args.digest,
              },
            ],
          },
        },
      },
    };

    try {
      const res = await fetch(offerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(this.config.get('KEP_DIIA_AUTH_HEADER')
            ? { [String(this.config.get('KEP_DIIA_AUTH_HEADER'))]: token }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Diia offer failed ${res.status}: ${text.slice(0, 500)}`);
        throw new BadRequestException(
          `Diia.Підпис: помилка offer API (${res.status}). Перевірте credentials / URL.`,
        );
      }
      const json = (await res.json()) as DiiaOfferResponse & Record<string, unknown>;
      return {
        requestId: String(json.requestId ?? json._id ?? json.id ?? args.sessionId),
        deeplink: (json.deeplink ?? json.deepLink ?? json.deeplinkUrl) as string | undefined,
        url: (json.url ?? json.deeplink ?? json.deepLink) as string | undefined,
        qr: json.qr as string | undefined,
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(`Diia offer network error: ${e}`);
      throw new ServiceUnavailableException('Не вдалося звʼязатися з Diia.Підпис API');
    }
  }

  private buildCloudAuthorizeUrl(args: {
    sessionId: string;
    digest: string;
    documentTitle: string;
    returnUrl: string;
  }) {
    const base = this.config.get('KEP_CLOUD_AUTHORIZE_URL');
    const clientId = this.config.get('KEP_CLOUD_CLIENT_ID');
    if (!base || !clientId) {
      throw new BadRequestException(
        'cloud_kep: задайте KEP_CLOUD_AUTHORIZE_URL і KEP_CLOUD_CLIENT_ID',
      );
    }
    const state = args.sessionId;
    const url = new URL(base);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', args.returnUrl);
    url.searchParams.set('scope', this.config.get('KEP_CLOUD_SCOPE', 'sign'));
    url.searchParams.set('digest', args.digest);
    url.searchParams.set('document_title', args.documentTitle);
    return { authorizeUrl: url.toString(), state };
  }

  private async exchangeCloudCode(code: string, sessionId: string) {
    const tokenUrl = this.config.get('KEP_CLOUD_TOKEN_URL');
    const clientId = this.config.get('KEP_CLOUD_CLIENT_ID');
    const clientSecret = this.config.get('KEP_CLOUD_CLIENT_SECRET');
    if (!tokenUrl || !clientId || !clientSecret) {
      // Dev fallback when only authorize URL is set
      return {
        signatureCms: Buffer.from(JSON.stringify({ cloud: true, code, sessionId })).toString(
          'base64',
        ),
        certificateSubject: 'Cloud KEP (code exchange incomplete config)',
        certificateSerial: undefined as string | undefined,
        raw: { code, note: 'KEP_CLOUD_TOKEN_URL not set — stored code only' },
      };
    }
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        session_id: sessionId,
      }),
    });
    if (!res.ok) {
      throw new BadRequestException(`Cloud KEP token exchange failed: ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return {
      signatureCms:
        typeof json.signature === 'string'
          ? json.signature
          : typeof json.signatureCms === 'string'
            ? json.signatureCms
            : Buffer.from(JSON.stringify(json)).toString('base64'),
      certificateSubject:
        typeof json.certificateSubject === 'string' ? json.certificateSubject : 'Cloud KEP',
      certificateSerial:
        typeof json.certificateSerial === 'string' ? json.certificateSerial : undefined,
      raw: json,
    };
  }

  private verifyWebhookAuth(
    body: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const secret = this.config.get<string>('KEP_WEBHOOK_SECRET');
    if (!secret) {
      if (this.config.get('NODE_ENV') === 'production') {
        throw new ForbiddenException('KEP_WEBHOOK_SECRET обовʼязковий у production');
      }
      return;
    }
    const hdr =
      (typeof headers['x-kep-secret'] === 'string' && headers['x-kep-secret']) ||
      (typeof headers['x-webhook-secret'] === 'string' && headers['x-webhook-secret']) ||
      (typeof headers['authorization'] === 'string' &&
        headers['authorization'].replace(/^Bearer\s+/i, ''));
    if (hdr && hdr === secret) return;

    const sig =
      (typeof headers['x-kep-signature'] === 'string' && headers['x-kep-signature']) ||
      (typeof headers['x-hub-signature-256'] === 'string' && headers['x-hub-signature-256']);
    if (sig) {
      const raw = JSON.stringify(body);
      const expected =
        'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
      const a = Buffer.from(expected);
      const b = Buffer.from(sig.startsWith('sha256=') ? sig : `sha256=${sig}`);
      if (a.length === b.length && timingSafeEqual(a, b)) return;
    }

    throw new ForbiddenException('Невірний секрет / підпис webhook КЕП');
  }

  mockAuthorizePage(sessionId: string): string {
    return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Mock КЕП / Дія.Підпис — Мій дім</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:420px;margin:2rem auto;padding:1rem;background:#0f172a;color:#e2e8f0}
  .card{background:#1e293b;border-radius:12px;padding:1.25rem}
  h1{font-size:1.15rem;margin:0 0 .5rem}
  p{color:#94a3b8;font-size:.9rem;line-height:1.45}
  button{width:100%;padding:.75rem;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;margin-top:.75rem}
  button.sec{background:#334155}
  code{font-size:.75rem;word-break:break-all;color:#7dd3fc}
</style></head><body>
<div class="card">
  <h1>Демо-підпис (Mock QES)</h1>
  <p>Це емулятор <strong>КЕП / Дія.Підпис</strong> для локальної розробки. У production підключіть реальні credentials (див. KEP_* у .env).</p>
  <p>Session: <code id="sid">${sessionId}</code></p>
  <button type="button" id="ok">Підписати документ</button>
  <button type="button" class="sec" id="cancel">Скасувати</button>
  <p id="msg"></p>
</div>
<script>
const sessionId = ${JSON.stringify(sessionId)};
const apiBase = location.origin + '/api';
document.getElementById('ok').onclick = async () => {
  const msg = document.getElementById('msg');
  msg.textContent = 'Підписуємо…';
  try {
    const r = await fetch(apiBase + '/kep/sessions/' + sessionId + '/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'mock_ok' }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || r.statusText);
    msg.textContent = '✓ Підписано. Можна закрити вікно.';
    if (window.opener) { try { window.opener.postMessage({ type: 'kep-signed', sessionId }, '*'); } catch(e){} }
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    msg.textContent = 'Помилка: ' + (e.message || e);
  }
};
document.getElementById('cancel').onclick = () => window.close();
</script>
</body></html>`;
  }
}

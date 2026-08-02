import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService, SessionMeta } from '../auth/auth.service';

/**
 * Diia / BankID Ukraine identity skeleton.
 * Enable: IDENTITY_ENABLED=true, IDENTITY_PROVIDER=diia|bankid|mock
 */
@Injectable()
export class IdentityService {
  private readonly pending = new Map<
    string,
    { exp: number; nonce: string; provider: string }
  >();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('IDENTITY_ENABLED', 'false') === 'true';
  }

  status() {
    return {
      enabled: this.isEnabled(),
      provider: this.config.get('IDENTITY_PROVIDER', 'mock'),
      clientIdConfigured: Boolean(this.config.get('IDENTITY_CLIENT_ID')),
      redirectUri:
        this.config.get('IDENTITY_REDIRECT_URI') ??
        `${this.config.get('APP_URL', 'http://localhost:3000')}/login?identity=callback`,
    };
  }

  private assertEnabled() {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Identity login вимкнено (IDENTITY_ENABLED)');
    }
  }

  startAuthorize(returnTo?: string) {
    this.assertEnabled();
    const provider = this.config.get('IDENTITY_PROVIDER', 'mock');
    const state = randomUUID();
    const nonce = randomUUID();
    this.pending.set(state, {
      exp: Date.now() + 10 * 60 * 1000,
      nonce,
      provider,
    });

    const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    const redirectUri =
      this.config.get('IDENTITY_REDIRECT_URI') ?? `${appUrl}/login?identity=callback`;
    const clientId = this.config.get('IDENTITY_CLIENT_ID', 'dah-dev');

    if (provider === 'mock') {
      const apiPort = this.config.get('API_PORT', '3001');
      const base =
        this.config.get('IDENTITY_MOCK_BASE') ?? `http://localhost:${apiPort}/api/identity`;
      const url = new URL(`${base}/mock/authorize`);
      url.searchParams.set('state', state);
      url.searchParams.set('nonce', nonce);
      url.searchParams.set('redirect_uri', redirectUri);
      if (returnTo) url.searchParams.set('return_to', returnTo);
      return { authorizeUrl: url.toString(), state, provider: 'mock' };
    }

    const authBase =
      this.config.get('IDENTITY_AUTHORIZE_URL') ??
      (provider === 'diia'
        ? 'https://api2s.diia.gov.ua/api/v1/auth/acquirer/offer-request'
        : 'https://bankid.privatbank.ua/DataAccessService/das/authorize');
    const url = new URL(authBase);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('scope', this.config.get('IDENTITY_SCOPE', 'openid profile phone'));
    return {
      authorizeUrl: url.toString(),
      state,
      provider,
      message: 'Configure IDENTITY_AUTHORIZE_URL + client credentials for production IdP',
    };
  }

  async completeCallback(
    body: { code?: string; state: string; phone?: string; email?: string },
    meta: SessionMeta = {},
  ) {
    this.assertEnabled();
    const pending = this.pending.get(body.state);
    if (!pending || Date.now() > pending.exp) {
      throw new UnauthorizedException('Identity state недійсний або прострочений');
    }
    this.pending.delete(body.state);

    if (pending.provider === 'mock') {
      return this.completeMock(body, meta);
    }

    const tokenUrl = this.config.get('IDENTITY_TOKEN_URL');
    const clientId = this.config.get('IDENTITY_CLIENT_ID');
    const clientSecret = this.config.get('IDENTITY_CLIENT_SECRET');
    if (!tokenUrl || !clientId || !clientSecret || !body.code) {
      throw new BadRequestException(
        'Identity provider не налаштовано (IDENTITY_TOKEN_URL / CLIENT_*) або немає code',
      );
    }

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: body.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri:
          this.config.get('IDENTITY_REDIRECT_URI') ??
          `${this.config.get('APP_URL', 'http://localhost:3000')}/login?identity=callback`,
      }).toString(),
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException('Identity token exchange failed');
    }
    const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };
    const claims = this.decodeJwtPayload(tokens.id_token ?? tokens.access_token ?? '');
    const email = String(claims.email ?? claims.preferred_username ?? '');
    const phone = claims.phone_number ? String(claims.phone_number) : body.phone;
    return this.loginByClaims({ email: email || undefined, phone }, meta);
  }

  async completeMock(
    body: { phone?: string; email?: string; code?: string },
    meta: SessionMeta = {},
  ) {
    let email = body.email;
    let phone = body.phone;
    if (body.code?.startsWith('mock_')) {
      try {
        const decoded = Buffer.from(body.code.slice(5), 'base64url').toString('utf8');
        if (decoded.includes('@')) email = decoded;
        else phone = decoded;
      } catch {
        /* ignore */
      }
    }
    return this.loginByClaims({ email, phone }, meta);
  }

  private async loginByClaims(
    claims: { email?: string; phone?: string },
    meta: SessionMeta,
  ) {
    let user =
      (claims.email
        ? await this.prisma.user.findUnique({ where: { email: claims.email } })
        : null) ??
      (claims.phone
        ? await this.prisma.user.findFirst({
            where: { phone: { contains: claims.phone.replace(/\D/g, '').slice(-9) } },
          })
        : null);

    if (!user) {
      throw new UnauthorizedException(
        'Користувача з цими даними Diia/BankID не знайдено. Зареєструйтесь або привʼяжіть phone/email.',
      );
    }
    if (user.status !== UserStatus.active) {
      throw new UnauthorizedException('Обліковий запис неактивний');
    }

    return this.auth.completeLogin(user, meta);
  }

  private decodeJwtPayload(jwt: string): Record<string, unknown> {
    const parts = jwt.split('.');
    if (parts.length < 2) return {};
    try {
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  }

  mockAuthorizePage(query: {
    state: string;
    redirect_uri: string;
    nonce?: string;
    return_to?: string;
  }): string {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"/><title>Mock Diia/BankID</title>
<style>body{font-family:system-ui;max-width:420px;margin:2rem auto;padding:1rem}
label{display:block;margin:.5rem 0 .2rem}input,button{width:100%;padding:.5rem;margin-bottom:.75rem}
.card{border:1px solid #ddd;border-radius:8px;padding:1rem}</style></head><body>
<div class="card"><h1>Mock Diia / BankID</h1>
<p>Локальний тестовий IdP. Вкажіть email або phone існуючого користувача «Мій дім».</p>
<form method="GET" action="${esc(query.redirect_uri)}">
<input type="hidden" name="identity" value="callback"/>
<input type="hidden" name="state" value="${esc(query.state)}"/>
<label>Email</label><input name="email" type="email" placeholder="resident@osbb.local"/>
<label>Або phone</label><input name="phone" type="tel" placeholder="+380..."/>
<button type="submit">Увійти як цей користувач</button>
</form></div></body></html>`;
  }
}

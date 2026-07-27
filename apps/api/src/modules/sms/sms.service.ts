import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * SMS providers:
 * - log (default): console only
 * - turbosms: https://api.turbosms.ua (Bearer token)
 * - alphasms: https://alphasms.ua/api/json.php (key in body)
 *
 * Enable: SMS_ENABLED=true, SMS_PROVIDER, SMS_API_KEY, SMS_SENDER.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly otpStore = new Map<string, { hash: string; exp: number }>();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('SMS_ENABLED', 'false') === 'true';
  }

  status() {
    return {
      enabled: this.isEnabled(),
      provider: this.config.get('SMS_PROVIDER', 'log'),
      sender: this.config.get('SMS_SENDER', 'DAH'),
      apiKeyConfigured: Boolean(this.config.get('SMS_API_KEY')),
    };
  }

  async send(to: string, text: string): Promise<{ ok: boolean; providerId?: string; logged?: boolean }> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('SMS вимкнено (SMS_ENABLED)');
    }
    const provider = this.config.get('SMS_PROVIDER', 'log');
    const normalized = normalizePhone(to);

    if (provider === 'log') {
      this.logger.log(JSON.stringify({ msg: 'sms_log', to: normalized, text }));
      return { ok: true, logged: true, providerId: `log_${Date.now()}` };
    }

    const apiKey = this.config.get<string>('SMS_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('SMS_API_KEY не налаштовано');
    }
    const sender = this.config.get('SMS_SENDER', 'DAH');

    if (provider === 'turbosms') {
      return this.sendTurboSms(normalized, text, apiKey, sender);
    }
    if (provider === 'alphasms') {
      return this.sendAlphaSms(normalized, text, apiKey, sender);
    }

    this.logger.warn(`Unknown SMS_PROVIDER=${provider}; falling back to log`);
    this.logger.log(JSON.stringify({ msg: 'sms_log', to: normalized, text, provider }));
    return { ok: true, logged: true, providerId: `${provider}_log_${Date.now()}` };
  }

  private async sendTurboSms(
    phone: string,
    text: string,
    token: string,
    sender: string,
  ): Promise<{ ok: boolean; providerId?: string }> {
    // TurboSMS JSON API v2 style: Authorization Bearer + message/send.json
    const recipients = [phone.replace(/^\+/, '')];
    const body = {
      recipients,
      sms: {
        sender,
        text,
      },
    };
    const url =
      this.config.get('SMS_API_URL') ?? 'https://api.turbosms.ua/message/send.json';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        response_code?: number;
        response_status?: string;
        response_result?: Array<{ message_id?: string; response_code?: number }>;
      };
      if (!res.ok) {
        this.logger.error(JSON.stringify({ msg: 'turbosms_http_error', status: res.status, json }));
        throw new ServiceUnavailableException('TurboSMS HTTP error');
      }
      const id =
        json.response_result?.[0]?.message_id ??
        json.response_status ??
        `turbosms_${Date.now()}`;
      this.logger.log(JSON.stringify({ msg: 'turbosms_ok', to: phone, id }));
      return { ok: true, providerId: String(id) };
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`TurboSMS failed: ${e instanceof Error ? e.message : e}`);
      throw new ServiceUnavailableException('TurboSMS недоступний');
    }
  }

  private async sendAlphaSms(
    phone: string,
    text: string,
    key: string,
    sender: string,
  ): Promise<{ ok: boolean; providerId?: string }> {
    const url = this.config.get('SMS_API_URL') ?? 'https://alphasms.ua/api/http.php';
    const params = new URLSearchParams({
      version: 'http',
      key,
      command: 'send',
      from: sender,
      to: phone.replace(/^\+/, ''),
      message: text,
    });
    try {
      const res = await fetch(`${url}?${params.toString()}`, { method: 'GET' });
      const textBody = await res.text();
      if (!res.ok) {
        this.logger.error(JSON.stringify({ msg: 'alphasms_http_error', status: res.status, textBody }));
        throw new ServiceUnavailableException('AlphaSMS HTTP error');
      }
      this.logger.log(JSON.stringify({ msg: 'alphasms_ok', to: phone, body: textBody.slice(0, 200) }));
      return { ok: true, providerId: textBody.trim().slice(0, 64) || `alphasms_${Date.now()}` };
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`AlphaSMS failed: ${e instanceof Error ? e.message : e}`);
      throw new ServiceUnavailableException('AlphaSMS недоступний');
    }
  }

  async sendOtp(phone: string, purpose = 'login'): Promise<{ ok: boolean; expiresInSec: number }> {
    const code = String(randomInt(100000, 999999));
    const expiresInSec = Number(this.config.get('SMS_OTP_TTL_SEC') ?? 300);
    const key = `${purpose}:${normalizePhone(phone)}`;
    const hash = createHash('sha256').update(code).digest('hex');
    this.otpStore.set(key, { hash, exp: Date.now() + expiresInSec * 1000 });

    await this.send(
      phone,
      `DAH код: ${code}. Дійсний ${Math.round(expiresInSec / 60)} хв.`,
    );
    return { ok: true, expiresInSec };
  }

  verifyOtp(phone: string, code: string, purpose = 'login'): boolean {
    const key = `${purpose}:${normalizePhone(phone)}`;
    const row = this.otpStore.get(key);
    if (!row) return false;
    if (Date.now() > row.exp) {
      this.otpStore.delete(key);
      return false;
    }
    const hash = createHash('sha256').update(code).digest('hex');
    const ok = hash === row.hash;
    if (ok) this.otpStore.delete(key);
    return ok;
  }

  async findUserByPhone(phone: string) {
    const n = normalizePhone(phone);
    return this.prisma.user.findFirst({
      where: { phone: { contains: n.slice(-9) } },
      select: { id: true, email: true, phone: true, role: true, status: true },
    });
  }
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('380') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
  if (digits.length === 9) return `+380${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

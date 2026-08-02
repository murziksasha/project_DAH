import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentSource } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateOnlinePaymentIntentDto } from './dto/online-payment.dto';
import { PaymentsService } from './payments.service';

/**
 * Optional online acquiring (LiqPay / WayForPay style) behind feature flag.
 * Enable with ONLINE_PAYMENTS_ENABLED=true and ONLINE_PAYMENTS_SECRET.
 *
 * Intent creates a pending order token; webhook verifies HMAC and posts Payment + FIFO.
 */
@Injectable()
export class OnlinePaymentsService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('ONLINE_PAYMENTS_ENABLED', 'false') === 'true';
  }

  private secret(): string {
    const s = this.config.get<string>('ONLINE_PAYMENTS_SECRET');
    if (!s) throw new ServiceUnavailableException('ONLINE_PAYMENTS_SECRET не налаштовано');
    return s;
  }

  status() {
    return {
      enabled: this.isEnabled(),
      provider: this.config.get('ONLINE_PAYMENTS_PROVIDER', 'generic'),
      publicKeyConfigured: Boolean(this.config.get('ONLINE_PAYMENTS_PUBLIC_KEY')),
    };
  }

  async createIntent(dto: CreateOnlinePaymentIntentDto, user: AuthUser) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Онлайн-оплата вимкнена (ONLINE_PAYMENTS_ENABLED)');
    }

    const apartment = await this.prisma.apartment.findUnique({ where: { id: dto.apartmentId } });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

    // Residents may only pay their own apartments
    if (user.role === 'resident') {
      const ids = user.apartmentIds?.length
        ? user.apartmentIds
        : user.apartmentId
          ? [user.apartmentId]
          : [];
      if (!ids.includes(dto.apartmentId)) {
        throw new BadRequestException('Немає доступу до цієї квартири');
      }
    }

    const orderId = `dah_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const description = dto.description ?? `Оплата внесків, кв. ${apartment.number}`;
    const provider = this.config.get('ONLINE_PAYMENTS_PROVIDER', 'generic');
    const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
    const publicKey = this.config.get<string>('ONLINE_PAYMENTS_PUBLIC_KEY') ?? '';

    // Internal payload for our webhook / sandbox
    const internalPayload = {
      orderId,
      apartmentId: dto.apartmentId,
      amount: dto.amount,
      userId: user.id,
      description,
    };
    const data = Buffer.from(JSON.stringify(internalPayload)).toString('base64url');
    const signature = createHmac('sha256', this.secret()).update(data).digest('hex');

    let checkoutUrl = `${appUrl}/resident?tab=account&payOrder=${orderId}`;
    let form: Record<string, string> | undefined;
    let formAction: string | undefined;

    if (provider === 'liqpay' && publicKey) {
      // LiqPay API checkout (https://www.liqpay.ua/doc/api/checkout)
      const liqpayObj = {
        public_key: publicKey,
        version: 3,
        action: 'pay',
        amount: dto.amount,
        currency: 'UAH',
        description,
        order_id: orderId,
        result_url: `${appUrl}/resident?tab=account&paid=1`,
        server_url: `${appUrl.replace(/\/$/, '')}/api/payments/online/webhook`,
        language: 'uk',
        // echo apartment for webhook recovery
        info: JSON.stringify({ apartmentId: dto.apartmentId, userId: user.id }),
      };
      const liqpayData = Buffer.from(JSON.stringify(liqpayObj)).toString('base64');
      const liqpaySig = createHmac('sha1', this.secret())
        .update(this.secret() + liqpayData + this.secret())
        .digest('base64');
      formAction = 'https://www.liqpay.ua/api/3/checkout';
      form = { data: liqpayData, signature: liqpaySig };
      checkoutUrl = formAction;
    } else if (provider === 'wayforpay' && publicKey) {
      // https://wiki.wayforpay.com — Purchase HMAC_MD5 signature
      const merchantDomainName = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const orderDate = String(Math.floor(Date.now() / 1000));
      const amountStr = Number(dto.amount).toFixed(2);
      const productName = description;
      const productCount = '1';
      const productPrice = amountStr;
      const signString = [
        publicKey,
        merchantDomainName,
        orderId,
        orderDate,
        amountStr,
        'UAH',
        productName,
        productCount,
        productPrice,
      ].join(';');
      const merchantSignature = createHmac('md5', this.secret())
        .update(signString, 'utf8')
        .digest('hex');
      formAction = 'https://secure.wayforpay.com/pay';
      form = {
        merchantAccount: publicKey,
        merchantAuthType: 'SimpleSignature',
        merchantDomainName,
        merchantSignature,
        orderReference: orderId,
        orderDate,
        amount: amountStr,
        currency: 'UAH',
        productName,
        productCount,
        productPrice,
        serviceUrl: `${appUrl.replace(/\/$/, '')}/api/payments/online/webhook`,
        returnUrl: `${appUrl}/resident?tab=account&paid=1`,
        clientEmail: user.email,
      };
      checkoutUrl = formAction;
    }

    return {
      orderId,
      amount: dto.amount,
      apartmentId: dto.apartmentId,
      data,
      signature,
      checkoutUrl,
      formAction,
      form,
      provider,
      message:
        provider === 'liqpay'
          ? 'LiqPay form ready — POST form fields to formAction'
          : provider === 'wayforpay'
            ? 'WayForPay form ready with merchantSignature (HMAC_MD5)'
            : 'Generic intent. Use sandbox-complete or wire provider form.',
    };
  }

  async handleWebhook(body: {
    orderId: string;
    status?: string;
    signature?: string;
    amount?: number;
    payload?: unknown;
  }) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Онлайн-оплата вимкнена');
    }

    const status = (body.status ?? 'success').toLowerCase();
    if (status !== 'success' && status !== 'sandbox' && status !== 'paid') {
      return { ok: false, message: `Ігноровано статус ${status}` };
    }

    let apartmentId: string | undefined;
    let amount = body.amount;
    let userId: string | undefined;

    if (typeof body.payload === 'string' || body.payload) {
      try {
        const raw =
          typeof body.payload === 'string'
            ? body.payload.includes('{')
              ? JSON.parse(body.payload)
              : JSON.parse(Buffer.from(body.payload, 'base64url').toString('utf8'))
            : body.payload;
        const p = raw as {
          apartmentId?: string;
          amount?: number;
          userId?: string;
          orderId?: string;
        };
        apartmentId = p.apartmentId;
        amount = amount ?? p.amount;
        userId = p.userId;
        if (body.signature && typeof body.payload === 'string') {
          const expected = createHmac('sha256', this.secret()).update(body.payload).digest('hex');
          const a = Buffer.from(expected);
          const b = Buffer.from(body.signature);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            throw new BadRequestException('Невірний підпис webhook');
          }
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        // fall through — use fields from body
      }
    }

    if (!apartmentId || amount == null) {
      throw new BadRequestException('Webhook: потрібні apartmentId і amount (або payload)');
    }

    // Idempotent: skip if payment with this reference exists
    const existing = await this.prisma.payment.findFirst({
      where: { reference: body.orderId, isVoided: false },
    });
    if (existing) {
      return { ok: true, paymentId: existing.id, duplicate: true };
    }

    const actorId =
      userId ??
      (
        await this.prisma.user.findFirst({
          where: { role: 'accountant', status: 'active' },
          select: { id: true },
        })
      )?.id ??
      (
        await this.prisma.user.findFirst({
          where: { role: 'chairman', status: 'active' },
          select: { id: true },
        })
      )?.id;

    if (!actorId) throw new BadRequestException('Немає користувача для запису платежу');

    const payment = await this.payments.createPayment(
      {
        apartmentId,
        amount,
        date: new Date().toISOString().slice(0, 10),
        source: PaymentSource.bank,
        reference: body.orderId,
      },
      {
        id: actorId,
        email: 'online@system',
        role: 'accountant',
        apartmentId: null,
        apartmentIds: [],
      },
    );

    return { ok: true, paymentId: payment.id, duplicate: false };
  }

  /**
   * Sandbox complete: create intent payload and immediately process as paid webhook.
   * Only when ONLINE_PAYMENTS_ENABLED=true and ONLINE_PAYMENTS_SANDBOX=true (or provider=generic).
   */
  async sandboxComplete(dto: CreateOnlinePaymentIntentDto, user: AuthUser) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Онлайн-оплата вимкнена');
    }
    const provider = this.config.get('ONLINE_PAYMENTS_PROVIDER', 'generic');
    const sandbox =
      this.config.get('ONLINE_PAYMENTS_SANDBOX', 'true') === 'true' || provider === 'generic';
    if (!sandbox) {
      throw new BadRequestException('Sandbox complete вимкнено для цього провайдера');
    }
    const intent = await this.createIntent(dto, user);
    const result = await this.handleWebhook({
      orderId: intent.orderId,
      status: 'success',
      amount: dto.amount,
      payload: intent.data,
      signature: intent.signature,
    });
    return { ...result, orderId: intent.orderId, sandbox: true };
  }
}

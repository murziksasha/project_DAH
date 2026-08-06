import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentSource, Prisma } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateOnlinePaymentIntentDto } from './dto/online-payment.dto';
import { PaymentsService } from './payments.service';

/**
 * Online acquiring (LiqPay / WayForPay / generic).
 * Production: ONLINE_PAYMENTS_ENABLED=true, SECRET + PUBLIC_KEY, SANDBOX=false.
 * Orders persisted in OnlinePaymentOrder for idempotent webhooks.
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

  isSandbox(): boolean {
    const provider = this.config.get('ONLINE_PAYMENTS_PROVIDER', 'generic');
    if (provider === 'generic') return true;
    return this.config.get('ONLINE_PAYMENTS_SANDBOX', 'true') === 'true';
  }

  private secret(): string {
    const s = this.config.get<string>('ONLINE_PAYMENTS_SECRET');
    if (!s) throw new ServiceUnavailableException('ONLINE_PAYMENTS_SECRET не налаштовано');
    return s;
  }

  status() {
    const provider = this.config.get('ONLINE_PAYMENTS_PROVIDER', 'generic');
    const publicKeyConfigured = Boolean(this.config.get('ONLINE_PAYMENTS_PUBLIC_KEY'));
    const secretConfigured = Boolean(this.config.get('ONLINE_PAYMENTS_SECRET'));
    const enabled = this.isEnabled();
    const sandbox = this.isSandbox();
    return {
      enabled,
      provider,
      sandbox,
      publicKeyConfigured,
      secretConfigured,
      productionReady:
        enabled &&
        !sandbox &&
        secretConfigured &&
        (provider === 'generic' || publicKeyConfigured),
      webhookPath: '/api/payments/online/webhook',
    };
  }

  async getOrder(orderId: string, user: AuthUser) {
    const order = await this.prisma.onlinePaymentOrder.findUnique({ where: { orderId } });
    if (!order) throw new NotFoundException('Замовлення не знайдено');
    if (user.role === 'resident' && order.userId && order.userId !== user.id) {
      throw new BadRequestException('Немає доступу до цього замовлення');
    }
    return order;
  }

  async createIntent(dto: CreateOnlinePaymentIntentDto, user: AuthUser) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Онлайн-оплата вимкнена (ONLINE_PAYMENTS_ENABLED)');
    }

    const apartment = await this.prisma.apartment.findUnique({ where: { id: dto.apartmentId } });
    if (!apartment) throw new NotFoundException('Квартиру не знайдено');

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
    const apiBase =
      this.config.get('API_PUBLIC_URL') ??
      `${appUrl.replace(/\/$/, '')}/api`;

    const internalPayload = {
      orderId,
      apartmentId: dto.apartmentId,
      amount: dto.amount,
      userId: user.id,
      description,
    };
    const data = Buffer.from(JSON.stringify(internalPayload)).toString('base64url');
    const signature = createHmac('sha256', this.secret()).update(data).digest('hex');

    await this.prisma.onlinePaymentOrder.create({
      data: {
        orderId,
        apartmentId: dto.apartmentId,
        amount: dto.amount,
        userId: user.id,
        provider,
        status: 'pending',
        description,
        providerMeta: { data, signature } as Prisma.InputJsonValue,
      },
    });

    let checkoutUrl = `${appUrl}/resident?tab=account&payOrder=${orderId}`;
    let form: Record<string, string> | undefined;
    let formAction: string | undefined;

    if (provider === 'liqpay' && publicKey) {
      const liqpayObj = {
        public_key: publicKey,
        version: 3,
        action: 'pay',
        amount: dto.amount,
        currency: 'UAH',
        description,
        order_id: orderId,
        result_url: `${appUrl}/resident?tab=account&paid=1&orderId=${orderId}`,
        server_url: `${apiBase.replace(/\/$/, '')}/payments/online/webhook`,
        language: 'uk',
        info: JSON.stringify({ apartmentId: dto.apartmentId, userId: user.id }),
      };
      const liqpayData = Buffer.from(JSON.stringify(liqpayObj)).toString('base64');
      const liqpaySig = createHmac('sha1', this.secret())
        .update(this.secret() + liqpayData + this.secret())
        .digest('base64');
      formAction = this.isSandbox()
        ? 'https://www.liqpay.ua/api/3/checkout'
        : 'https://www.liqpay.ua/api/3/checkout';
      form = { data: liqpayData, signature: liqpaySig };
      checkoutUrl = formAction;
    } else if (provider === 'wayforpay' && publicKey) {
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
        serviceUrl: `${apiBase.replace(/\/$/, '')}/payments/online/webhook`,
        returnUrl: `${appUrl}/resident?tab=account&paid=1&orderId=${orderId}`,
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
      sandbox: this.isSandbox(),
      message:
        provider === 'liqpay'
          ? 'LiqPay form ready — POST form fields to formAction'
          : provider === 'wayforpay'
            ? 'WayForPay form ready with merchantSignature (HMAC_MD5)'
            : this.isSandbox()
              ? 'Sandbox intent. Use sandbox-complete for local test.'
              : 'Generic production intent — complete via signed webhook.',
    };
  }

  /**
   * Accepts:
   * - Generic: { orderId, status, signature, amount?, payload? }
   * - LiqPay: { data, signature } (base64 JSON + SHA1)
   * - WayForPay: { orderReference, transactionStatus, merchantSignature, amount, ... }
   */
  async handleWebhook(body: Record<string, unknown>) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Онлайн-оплата вимкнена');
    }

    // LiqPay callback style
    if (typeof body.data === 'string' && typeof body.signature === 'string' && !body.orderId) {
      return this.handleLiqpayWebhook(body.data, body.signature);
    }

    // WayForPay service URL style
    if (typeof body.orderReference === 'string' || body.merchantSignature) {
      return this.handleWayforpayWebhook(body);
    }

    return this.handleGenericWebhook(body as {
      orderId: string;
      status?: string;
      signature?: string;
      amount?: number;
      payload?: unknown;
    });
  }

  private async handleLiqpayWebhook(data: string, signature: string) {
    const expected = createHmac('sha1', this.secret())
      .update(this.secret() + data + this.secret())
      .digest('base64');
    this.assertSig(expected, signature);

    let parsed: {
      order_id?: string;
      status?: string;
      amount?: number | string;
      info?: string;
    };
    try {
      parsed = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('LiqPay: некоректний data');
    }

    const orderId = parsed.order_id;
    if (!orderId) throw new BadRequestException('LiqPay: немає order_id');
    const st = (parsed.status ?? '').toLowerCase();
    if (!['success', 'sandbox', 'wait_accept', 'paid'].includes(st)) {
      await this.markOrderFailed(orderId, st);
      return { ok: false, message: `LiqPay status ${st}` };
    }
    // wait_accept may still be pending — only success/sandbox/paid finalize
    if (st === 'wait_accept' && !this.isSandbox()) {
      return { ok: true, pending: true, orderId };
    }

    const amount = Number(parsed.amount);
    return this.finalizePaid(orderId, amount, { provider: 'liqpay', rawStatus: st });
  }

  private async handleWayforpayWebhook(body: Record<string, unknown>) {
    const orderId = String(body.orderReference ?? body.orderId ?? '');
    if (!orderId) throw new BadRequestException('WayForPay: немає orderReference');

    const status = String(body.transactionStatus ?? body.status ?? '').toLowerCase();
    if (!['approved', 'success', 'paid', 'sandbox'].includes(status)) {
      await this.markOrderFailed(orderId, status);
      return { ok: false, message: `WayForPay status ${status}` };
    }

    // Optional signature check when merchantSignature present
    const sig = body.merchantSignature;
    if (typeof sig === 'string' && !this.isSandbox()) {
      const publicKey = this.config.get<string>('ONLINE_PAYMENTS_PUBLIC_KEY') ?? '';
      const amount = String(body.amount ?? '');
      const currency = String(body.currency ?? 'UAH');
      const authCode = String(body.authCode ?? '');
      const cardPan = String(body.cardPan ?? '');
      const transactionStatus = String(body.transactionStatus ?? '');
      const reasonCode = String(body.reasonCode ?? '');
      const signString = [
        publicKey,
        orderId,
        amount,
        currency,
        authCode,
        cardPan,
        transactionStatus,
        reasonCode,
      ].join(';');
      const expected = createHmac('md5', this.secret()).update(signString, 'utf8').digest('hex');
      this.assertSig(expected, sig);
    }

    return this.finalizePaid(orderId, Number(body.amount), {
      provider: 'wayforpay',
      rawStatus: status,
    });
  }

  private async handleGenericWebhook(body: {
    orderId: string;
    status?: string;
    signature?: string;
    amount?: number;
    payload?: unknown;
  }) {
    const status = (body.status ?? 'success').toLowerCase();
    if (status !== 'success' && status !== 'sandbox' && status !== 'paid') {
      await this.markOrderFailed(body.orderId, status);
      return { ok: false, message: `Ігноровано статус ${status}` };
    }

    let apartmentId: string | undefined;
    let amount = body.amount;
    let userId: string | undefined;
    let orderId = body.orderId;

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
        if (p.orderId) orderId = p.orderId;
        if (body.signature && typeof body.payload === 'string') {
          const expected = createHmac('sha256', this.secret()).update(body.payload).digest('hex');
          this.assertSig(expected, body.signature);
        } else if (!this.isSandbox() && !body.signature) {
          throw new BadRequestException('Production webhook потребує signature');
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
      }
    } else if (!this.isSandbox() && !body.signature) {
      throw new BadRequestException('Production webhook потребує signature або payload');
    }

    // Prefer DB order
    const existingOrder = await this.prisma.onlinePaymentOrder.findUnique({
      where: { orderId },
    });
    if (existingOrder) {
      amount = amount ?? Number(existingOrder.amount);
      apartmentId = apartmentId ?? existingOrder.apartmentId;
      userId = userId ?? existingOrder.userId ?? undefined;
    }

    if (!apartmentId || amount == null) {
      throw new BadRequestException('Webhook: потрібні apartmentId і amount (або збережене order)');
    }

    return this.finalizePaid(orderId, amount, {
      provider: 'generic',
      apartmentId,
      userId,
    });
  }

  private async finalizePaid(
    orderId: string,
    amount: number,
    meta: {
      provider: string;
      rawStatus?: string;
      apartmentId?: string;
      userId?: string;
    },
  ) {
    const order = await this.prisma.onlinePaymentOrder.findUnique({ where: { orderId } });
    if (order?.status === 'paid' && order.paymentId) {
      return { ok: true, paymentId: order.paymentId, duplicate: true, orderId };
    }

    // Also idempotent by payment.reference
    const existingPay = await this.prisma.payment.findFirst({
      where: { reference: orderId, isVoided: false },
    });
    if (existingPay) {
      if (order && order.status !== 'paid') {
        await this.prisma.onlinePaymentOrder.update({
          where: { orderId },
          data: {
            status: 'paid',
            paymentId: existingPay.id,
            paidAt: new Date(),
          },
        });
      }
      return { ok: true, paymentId: existingPay.id, duplicate: true, orderId };
    }

    const apartmentId = meta.apartmentId ?? order?.apartmentId;
    const payAmount = amount ?? (order ? Number(order.amount) : NaN);
    if (!apartmentId || !Number.isFinite(payAmount)) {
      throw new BadRequestException('Неможливо завершити оплату: немає apartmentId/amount');
    }

    if (order && Math.abs(Number(order.amount) - payAmount) > 0.02) {
      throw new BadRequestException(
        `Сума webhook (${payAmount}) не збігається з замовленням (${order.amount})`,
      );
    }

    const actorId =
      meta.userId ??
      order?.userId ??
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
        amount: payAmount,
        date: new Date().toISOString().slice(0, 10),
        source: PaymentSource.bank,
        reference: orderId,
      },
      {
        id: actorId,
        email: 'online@system',
        role: 'accountant',
        apartmentId: null,
        apartmentIds: [],
      },
    );

    if (order) {
      await this.prisma.onlinePaymentOrder.update({
        where: { orderId },
        data: {
          status: 'paid',
          paymentId: payment.id,
          paidAt: new Date(),
          providerMeta: {
            ...((order.providerMeta as object) ?? {}),
            webhook: meta,
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      await this.prisma.onlinePaymentOrder.create({
        data: {
          orderId,
          apartmentId,
          amount: payAmount,
          userId: meta.userId,
          provider: meta.provider,
          status: 'paid',
          paymentId: payment.id,
          paidAt: new Date(),
          providerMeta: meta as Prisma.InputJsonValue,
        },
      });
    }

    return { ok: true, paymentId: payment.id, duplicate: false, orderId };
  }

  private async markOrderFailed(orderId: string, status: string) {
    try {
      await this.prisma.onlinePaymentOrder.updateMany({
        where: { orderId, status: 'pending' },
        data: {
          status: 'failed',
          providerMeta: { lastStatus: status } as Prisma.InputJsonValue,
        },
      });
    } catch {
      /* ignore */
    }
  }

  private assertSig(expected: string, actual: string) {
    const a = Buffer.from(expected);
    const b = Buffer.from(actual);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Невірний підпис webhook');
    }
  }

  async sandboxComplete(dto: CreateOnlinePaymentIntentDto, user: AuthUser) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Онлайн-оплата вимкнена');
    }
    if (!this.isSandbox()) {
      throw new BadRequestException(
        'Sandbox complete вимкнено (ONLINE_PAYMENTS_SANDBOX=false — production mode)',
      );
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

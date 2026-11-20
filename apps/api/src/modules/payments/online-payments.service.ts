import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentSource, Prisma, UserRole } from '../../prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { toMinor } from '@dah/money';
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
export class OnlinePaymentsService implements OnModuleInit {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private payments: PaymentsService,
  ) {}

  onModuleInit() {
    if (this.isEnabled() && !this.isSandbox()) {
      const provider = this.config.get('ONLINE_PAYMENTS_PROVIDER', 'generic');
      if (provider === 'generic') {
        throw new Error(
          'ONLINE_PAYMENTS_PROVIDER=generic заборонено у production режимі (ONLINE_PAYMENTS_SANDBOX=false). Використовуйте liqpay або wayforpay.',
        );
      }
    }
  }

  isEnabled(): boolean {
    return this.config.get('ONLINE_PAYMENTS_ENABLED', 'false') === 'true';
  }

  isSandbox(): boolean {
    const raw = this.config.get<string>('ONLINE_PAYMENTS_SANDBOX');
    if (raw !== undefined && raw !== null && raw !== '') {
      return String(raw).toLowerCase() === 'true';
    }
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (isProd) return false;
    return true;
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
        provider !== 'generic' &&
        publicKeyConfigured,
      webhookPath: '/api/payments/online/webhook',
    };
  }

  async getOrder(orderId: string, user: AuthUser) {
    const order = await this.prisma.onlinePaymentOrder.findUnique({ where: { orderId } });
    if (!order) throw new NotFoundException('Замовлення не знайдено');
    if (user.role === 'resident') {
      const own = user.apartmentIds?.length
        ? user.apartmentIds
        : user.apartmentId
          ? [user.apartmentId]
          : [];
      const mine = order.userId ? order.userId === user.id : own.includes(order.apartmentId);
      if (!mine) throw new NotFoundException('Замовлення не знайдено');
    } else if (user.role !== 'super_admin') {
      // Staff: only orders of apartments in their organization.
      const apt = await this.prisma.apartment.findUnique({
        where: { id: order.apartmentId },
        select: { building: { select: { tenantId: true } } },
      });
      if (!user.tenantId || apt?.building.tenantId !== user.tenantId) {
        throw new NotFoundException('Замовлення не знайдено');
      }
    }
    return order;
  }

  async createIntent(dto: CreateOnlinePaymentIntentDto, user: AuthUser) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Онлайн-оплата вимкнена (ONLINE_PAYMENTS_ENABLED)');
    }

    const provider = this.config.get('ONLINE_PAYMENTS_PROVIDER', 'generic');
    if (provider === 'generic' && !this.isSandbox()) {
      throw new BadRequestException(
        'Generic-провайдер заборонено у production режимі (ONLINE_PAYMENTS_SANDBOX=false)',
      );
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
      const liqpaySig = createHash('sha1')
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

    // Determine incoming payload structure and extract referenced orderId
    let orderId: string | null = null;
    let isLiqPay = false;
    let isWayForPay = false;
    let liqpayData = '';
    let liqpaySig = '';

    if (typeof body.data === 'string' && typeof body.signature === 'string' && !body.orderId) {
      isLiqPay = true;
      liqpayData = body.data;
      liqpaySig = body.signature;
      try {
        const parsed = JSON.parse(Buffer.from(liqpayData, 'base64').toString('utf8'));
        orderId = parsed.order_id ? String(parsed.order_id) : null;
      } catch {
        throw new BadRequestException('LiqPay: некоректний data');
      }
    } else if (typeof body.orderReference === 'string' || body.merchantSignature) {
      isWayForPay = true;
      orderId = String(body.orderReference ?? body.orderId ?? '');
    } else if (typeof body.orderId === 'string') {
      orderId = String(body.orderId);
    }

    if (!orderId) {
      throw new BadRequestException('Webhook: відсутній ідентифікатор замовлення');
    }

    // Order MUST exist in DB — protocol and expectations derive from persisted order
    const order = await this.prisma.onlinePaymentOrder.findUnique({
      where: { orderId },
    });
    if (!order) {
      throw new NotFoundException(`Замовлення ${orderId} не знайдено`);
    }

    if (order.provider === 'liqpay') {
      if (!isLiqPay) {
        throw new BadRequestException(`Очікується формат LiqPay для замовлення ${orderId}`);
      }
      return this.handleLiqpayWebhook(liqpayData, liqpaySig, order);
    }

    if (order.provider === 'wayforpay') {
      if (!isWayForPay) {
        throw new BadRequestException(`Очікується формат WayForPay для замовлення ${orderId}`);
      }
      return this.handleWayforpayWebhook(body, order);
    }

    return this.handleGenericWebhook(
      body as {
        orderId: string;
        status?: string;
        signature?: string;
        amount?: number;
        payload?: unknown;
      },
      order,
    );
  }

  private async handleLiqpayWebhook(
    data: string,
    signature: string,
    order: { orderId: string; amount: Prisma.Decimal; apartmentId: string; userId: string | null },
  ) {
    // Official LiqPay SDK signature: base64(sha1(private_key + data + private_key))
    const expected = createHash('sha1')
      .update(this.secret() + data + this.secret())
      .digest('base64');
    this.assertSig(expected, signature);

    let parsed: {
      order_id?: string;
      status?: string;
      amount?: number | string;
      currency?: string;
      info?: string;
      public_key?: string;
    };
    try {
      parsed = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('LiqPay: некоректний data');
    }

    const publicKey = this.config.get<string>('ONLINE_PAYMENTS_PUBLIC_KEY');
    if (publicKey && parsed.public_key && parsed.public_key !== publicKey) {
      throw new BadRequestException('LiqPay: невідповідний public_key');
    }

    if (parsed.order_id && String(parsed.order_id) !== order.orderId) {
      throw new BadRequestException(`LiqPay: невідповідний order_id ${parsed.order_id}`);
    }

    if (parsed.currency && parsed.currency.toUpperCase() !== 'UAH') {
      throw new BadRequestException(`LiqPay: непідтримувана валюта ${parsed.currency}`);
    }

    const orderMinor = toMinor(Number(order.amount));
    const payMinor = toMinor(Number(parsed.amount));
    if (orderMinor !== payMinor) {
      throw new BadRequestException(
        `LiqPay: сума (${parsed.amount} грн) не збігається з замовленням (${order.amount} грн)`,
      );
    }

    const st = (parsed.status ?? '').toLowerCase();
    if (['wait_accept', 'wait_secure', 'processing', 'hold_wait'].includes(st)) {
      return { ok: true, pending: true, orderId: order.orderId };
    }

    if (!this.isPaidStatus(st, ['success', 'paid'])) {
      if (['failure', 'error', 'reversed'].includes(st)) {
        await this.markOrderFailed(order.orderId, st);
      }
      return { ok: false, message: `LiqPay status ${st}` };
    }

    const amount = Number(parsed.amount);
    return this.finalizePaid(order.orderId, amount, { provider: 'liqpay', rawStatus: st });
  }

  private async handleWayforpayWebhook(
    body: Record<string, unknown>,
    order: { orderId: string; amount: Prisma.Decimal; apartmentId: string; userId: string | null },
  ) {
    // 1. Check signature FIRST before inspecting or reacting to transactionStatus
    const sig = body.merchantSignature;
    if (!this.isSandbox()) {
      if (typeof sig !== 'string' || !sig) {
        throw new BadRequestException('WayForPay: немає merchantSignature');
      }
      const publicKey = this.config.get<string>('ONLINE_PAYMENTS_PUBLIC_KEY') ?? '';
      if (body.merchantAccount && String(body.merchantAccount) !== publicKey) {
        throw new BadRequestException('WayForPay: невідповідний merchantAccount');
      }
      const amount = String(body.amount ?? '');
      const currency = String(body.currency ?? 'UAH');
      const authCode = String(body.authCode ?? '');
      const cardPan = String(body.cardPan ?? '');
      const transactionStatus = String(body.transactionStatus ?? '');
      const reasonCode = String(body.reasonCode ?? '');
      const signString = [
        publicKey,
        order.orderId,
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

    if (body.currency && String(body.currency).toUpperCase() !== 'UAH') {
      throw new BadRequestException(`WayForPay: непідтримувана валюта ${body.currency}`);
    }

    const orderMinor = toMinor(Number(order.amount));
    const payMinor = toMinor(Number(body.amount));
    if (orderMinor !== payMinor) {
      throw new BadRequestException(
        `WayForPay: сума (${body.amount} грн) не збігається з замовленням (${order.amount} грн)`,
      );
    }

    const time = Math.floor(Date.now() / 1000);
    const signString = `${order.orderId};accept;${time}`;
    const responseSignature = createHmac('md5', this.secret()).update(signString, 'utf8').digest('hex');
    const wayforpayResponse = {
      ok: true,
      orderReference: order.orderId,
      status: 'accept',
      time,
      signature: responseSignature,
    };

    const status = String(body.transactionStatus ?? body.status ?? '').toLowerCase();
    if (!this.isPaidStatus(status, ['approved', 'success', 'paid'])) {
      if (['declined', 'failed', 'expired', 'refunded'].includes(status)) {
        await this.markOrderFailed(order.orderId, status);
      }
      return wayforpayResponse;
    }

    const finalizeResult = await this.finalizePaid(order.orderId, Number(body.amount), {
      provider: 'wayforpay',
      rawStatus: status,
    });

    return {
      ...wayforpayResponse,
      ...finalizeResult,
    };
  }

  private async handleGenericWebhook(
    body: {
      orderId: string;
      status?: string;
      signature?: string;
      amount?: number;
      payload?: unknown;
    },
    order: { orderId: string; amount: Prisma.Decimal; apartmentId: string; userId: string | null },
  ) {
    if (!this.isSandbox()) {
      throw new BadRequestException(
        'Generic-провайдер недоступний у production режимі (тільки sandbox)',
      );
    }

    let payloadString = '';
    let parsedPayload: Record<string, unknown> | null = null;
    if (typeof body.payload === 'string') {
      payloadString = body.payload;
      try {
        parsedPayload = JSON.parse(Buffer.from(body.payload, 'base64url').toString('utf8'));
      } catch {
        try {
          parsedPayload = JSON.parse(body.payload);
        } catch {
          /* ignore */
        }
      }
    } else if (body.payload && typeof body.payload === 'object') {
      payloadString = JSON.stringify(body.payload);
      parsedPayload = body.payload as Record<string, unknown>;
    }

    if (body.signature) {
      const stringToSign = payloadString || order.orderId;
      const expected = createHmac('sha256', this.secret()).update(stringToSign).digest('hex');
      this.assertSig(expected, body.signature);
    }

    if (parsedPayload) {
      if (parsedPayload.orderId && parsedPayload.orderId !== order.orderId) {
        throw new BadRequestException(
          `Generic: payload.orderId (${parsedPayload.orderId}) не відповідає замовленню (${order.orderId})`,
        );
      }
      if (parsedPayload.amount !== undefined) {
        const payloadMinor = toMinor(Number(parsedPayload.amount));
        const orderMinor = toMinor(Number(order.amount));
        if (payloadMinor !== orderMinor) {
          throw new BadRequestException(
            `Generic: payload.amount (${parsedPayload.amount}) не збігається з замовленням (${order.amount})`,
          );
        }
      }
    }

    const payAmount = body.amount !== undefined ? Number(body.amount) : Number(order.amount);
    const orderMinor = toMinor(Number(order.amount));
    const payMinor = toMinor(payAmount);
    if (orderMinor !== payMinor) {
      throw new BadRequestException(
        `Generic: сума webhook (${payAmount}) не збігається з замовленням (${order.amount})`,
      );
    }

    const status = (body.status ?? 'success').toLowerCase();
    if (!this.isPaidStatus(status, ['success', 'paid'])) {
      await this.markOrderFailed(order.orderId, status);
      return { ok: false, message: `Ігноровано статус ${status}` };
    }

    return this.finalizePaid(order.orderId, payAmount, {
      provider: 'generic',
      apartmentId: order.apartmentId,
      userId: order.userId ?? undefined,
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
    const payMinor = toMinor(amount);

    const executeInTx = async (tx: Prisma.TransactionClient) => {
      const order = await tx.onlinePaymentOrder.findUnique({
        where: { orderId },
        include: { payment: true },
      });
      if (!order) {
        throw new NotFoundException(`Замовлення ${orderId} не знайдено`);
      }

      if (order.status === 'paid' && order.paymentId) {
        return { ok: true, paymentId: order.paymentId, duplicate: true, orderId };
      }

      // Amount match check in integer kopiiky
      const orderMinor = toMinor(Number(order.amount));
      if (orderMinor !== payMinor) {
        throw new BadRequestException(
          `Сума webhook (${amount} грн) не збігається з замовленням (${order.amount} грн)`,
        );
      }

      // Also check if already recorded via payment.reference
      const existingPay = await tx.payment.findFirst({
        where: { reference: orderId, isVoided: false },
      });
      if (existingPay) {
        await tx.onlinePaymentOrder.update({
          where: { orderId },
          data: {
            status: 'paid',
            paymentId: existingPay.id,
            paidAt: new Date(),
          },
        });
        return { ok: true, paymentId: existingPay.id, duplicate: true, orderId };
      }

      // Atomic claim within transaction to prevent race conditions across concurrent webhooks
      // Also allows recovering stale processing orders interrupted by a server restart or crash (>30s)
      const staleThreshold = new Date(Date.now() - 30 * 1000);
      const claim = await tx.onlinePaymentOrder.updateMany({
        where: {
          orderId,
          OR: [
            { status: { in: ['pending', 'wait_accept'] } },
            { status: 'processing', updatedAt: { lt: staleThreshold } },
          ],
        },
        data: {
          status: 'processing',
        },
      });

      if (claim.count === 0) {
        const fresh = await tx.onlinePaymentOrder.findUnique({
          where: { orderId },
        });
        if (fresh?.status === 'paid' && fresh.paymentId) {
          return { ok: true, paymentId: fresh.paymentId, duplicate: true, orderId };
        }
        return { ok: true, pending: true, orderId };
      }

      try {
        const actorId =
          meta.userId ??
          order.userId ??
          (
            await tx.user.findFirst({
              where: { role: 'accountant', status: 'active' },
              select: { id: true },
            })
          )?.id ??
          (
            await tx.user.findFirst({
              where: { role: 'chairman', status: 'active' },
              select: { id: true },
            })
          )?.id;

        if (!actorId) {
          throw new BadRequestException('Немає користувача для запису платежу');
        }

        const payment = await this.payments.createPayment(
          {
            apartmentId: order.apartmentId,
            amount: Number(order.amount),
            date: new Date().toISOString().slice(0, 10),
            source: PaymentSource.bank,
            reference: orderId,
          },
          {
            id: actorId,
            email: 'online@system',
            role: UserRole.accountant,
            apartmentId: null,
            apartmentIds: [],
          },
          tx,
        );

        await tx.onlinePaymentOrder.update({
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

        return { ok: true, paymentId: payment.id, duplicate: false, orderId };
      } catch (err) {
        await tx.onlinePaymentOrder
          .updateMany({
            where: { orderId, status: 'processing', paymentId: null },
            data: { status: 'pending' },
          })
          .catch(() => undefined);
        throw err;
      }
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(executeInTx);
    }
    return executeInTx(this.prisma as unknown as Prisma.TransactionClient);
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

  /** L12: provider status `sandbox` counts as paid only in sandbox mode. */
  private isPaidStatus(status: string, paid: string[]): boolean {
    if (paid.includes(status)) return true;
    return status === 'sandbox' && this.isSandbox();
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

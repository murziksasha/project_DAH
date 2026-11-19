import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { OnlinePaymentsService } from './online-payments.service';

describe('OnlinePaymentsService - Security & Signatures', () => {
  const secret = 'test-secret-key-at-least-32-chars-long';
  const publicKey = 'test-public-key';

  function createService(env: Record<string, string | undefined>) {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        return env[key] !== undefined ? env[key] : defaultValue;
      }),
    } as unknown as ConfigService;

    const prisma = {
      onlinePaymentOrder: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'usr-accountant-1' }),
      },
    } as any;

    const payments = {
      createPayment: jest.fn().mockResolvedValue({ id: 'pmt-1' }),
    } as any;

    return new OnlinePaymentsService(config, prisma, payments);
  }

  describe('isSandbox', () => {
    it('defaults to false in production when ONLINE_PAYMENTS_SANDBOX is unset', () => {
      const s = createService({ NODE_ENV: 'production' });
      expect(s.isSandbox()).toBe(false);
    });

    it('defaults to true in non-production when unset', () => {
      const s = createService({ NODE_ENV: 'development' });
      expect(s.isSandbox()).toBe(true);
    });

    it('respects explicit ONLINE_PAYMENTS_SANDBOX flag', () => {
      const prodWithExplicit = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_SANDBOX: 'true',
      });
      expect(prodWithExplicit.isSandbox()).toBe(true);

      const devWithExplicit = createService({
        NODE_ENV: 'development',
        ONLINE_PAYMENTS_SANDBOX: 'false',
      });
      expect(devWithExplicit.isSandbox()).toBe(false);
    });
  });

  describe('Order existence & Provider validation', () => {
    it('rejects webhook when order is not found in database', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_SECRET: secret,
      });

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue(null);

      await expect(
        s.handleWebhook({
          orderId: 'unknown-order-404',
          status: 'success',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects format mismatch when provider does not match persisted order', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_SECRET: secret,
      });

      // DB order is wayforpay
      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-1',
        orderId: 'order-wayforpay-1',
        provider: 'wayforpay',
        amount: 500,
        status: 'pending',
      });

      // But incoming webhook is generic style without wayforpay fields
      await expect(
        s.handleWebhook({
          orderId: 'order-wayforpay-1',
          status: 'success',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('WayForPay webhook signature enforcement', () => {
    it('throws BadRequestException when outside sandbox and merchantSignature is missing', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'wayforpay',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
        ONLINE_PAYMENTS_PUBLIC_KEY: publicKey,
      });

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-order-1',
        orderId: 'order-123',
        provider: 'wayforpay',
        status: 'pending',
        amount: 500,
        apartmentId: 'apt-1',
      });

      await expect(
        s.handleWebhook({
          orderReference: 'order-123',
          transactionStatus: 'Approved',
          amount: '500.00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when merchantSignature is invalid', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'wayforpay',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
        ONLINE_PAYMENTS_PUBLIC_KEY: publicKey,
      });

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-order-1',
        orderId: 'order-123',
        provider: 'wayforpay',
        status: 'pending',
        amount: 500,
        apartmentId: 'apt-1',
      });

      await expect(
        s.handleWebhook({
          orderReference: 'order-123',
          transactionStatus: 'Approved',
          amount: '500.00',
          merchantSignature: 'invalid-signature-hash',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsigned Declined webhook without marking order failed', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'wayforpay',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
        ONLINE_PAYMENTS_PUBLIC_KEY: publicKey,
      });

      const orderReference = 'order-declined-unsigned';
      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-order-declined',
        orderId: orderReference,
        provider: 'wayforpay',
        status: 'pending',
        amount: 500,
        apartmentId: 'apt-1',
      });

      await expect(
        s.handleWebhook({
          orderReference,
          transactionStatus: 'Declined',
          amount: '500.00',
        }),
      ).rejects.toThrow(BadRequestException);

      expect((s as any).prisma.onlinePaymentOrder.updateMany).not.toHaveBeenCalled();
    });

    it('returns signed WayForPay response structure upon successful processing', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'wayforpay',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
        ONLINE_PAYMENTS_PUBLIC_KEY: publicKey,
      });

      const orderReference = 'order-wfp-signed-resp';
      const amount = '500.00';
      const currency = 'UAH';
      const authCode = '123456';
      const cardPan = '4111****1111';
      const transactionStatus = 'Approved';
      const reasonCode = '1100';

      const signString = [
        publicKey,
        orderReference,
        amount,
        currency,
        authCode,
        cardPan,
        transactionStatus,
        reasonCode,
      ].join(';');
      const validSig = createHmac('md5', secret).update(signString, 'utf8').digest('hex');

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-order-1',
        orderId: orderReference,
        provider: 'wayforpay',
        status: 'pending',
        amount: 500,
        apartmentId: 'apt-1',
        userId: 'usr-1',
      });
      (s as any).prisma.onlinePaymentOrder.update.mockResolvedValue({});
      (s as any).prisma.onlinePaymentOrder.updateMany.mockResolvedValue({ count: 1 });
      (s as any).payments.createPayment.mockResolvedValue({ id: 'pmt-1' });

      const res = (await s.handleWebhook({
        orderReference,
        amount,
        currency,
        authCode,
        cardPan,
        transactionStatus,
        reasonCode,
        merchantSignature: validSig,
      })) as any;

      expect(res.orderReference).toBe(orderReference);
      expect(res.status).toBe('accept');
      expect(typeof res.time).toBe('number');
      expect(typeof res.signature).toBe('string');
      const expectedRespSig = createHmac('md5', secret)
        .update(`${orderReference};accept;${res.time}`)
        .digest('hex');
      expect(res.signature).toBe(expectedRespSig);
    });
  });

  describe('LiqPay webhook signature & provider verification', () => {
    it('rejects LiqPay webhook with invalid SHA1 signature', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'liqpay',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
        ONLINE_PAYMENTS_PUBLIC_KEY: publicKey,
      });

      const orderId = 'liqpay-order-1';
      const payload = {
        order_id: orderId,
        status: 'success',
        amount: 350,
        currency: 'UAH',
      };
      const data = Buffer.from(JSON.stringify(payload)).toString('base64');

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-liqpay-1',
        orderId,
        provider: 'liqpay',
        status: 'pending',
        amount: 350,
        apartmentId: 'apt-1',
      });

      await expect(
        s.handleWebhook({
          data,
          signature: 'invalid-sha1-signature',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts and finalizes LiqPay webhook with official SHA1 signature', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'liqpay',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
        ONLINE_PAYMENTS_PUBLIC_KEY: publicKey,
      });

      const orderId = 'liqpay-order-1';
      const payload = {
        order_id: orderId,
        status: 'success',
        amount: 350,
        currency: 'UAH',
      };
      const data = Buffer.from(JSON.stringify(payload)).toString('base64');
      const expectedSig = createHash('sha1')
        .update(secret + data + secret)
        .digest('base64');

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-liqpay-1',
        orderId,
        provider: 'liqpay',
        status: 'pending',
        amount: 350,
        apartmentId: 'apt-1',
      });
      (s as any).prisma.onlinePaymentOrder.updateMany.mockResolvedValue({ count: 1 });
      (s as any).payments.createPayment.mockResolvedValue({ id: 'pmt-liq-1' });

      const res = await s.handleWebhook({
        data,
        signature: expectedSig,
      });

      expect((res as any).ok).toBe(true);
      if ('paymentId' in res) {
        expect(res.paymentId).toBe('pmt-liq-1');
      }
    });

    it('rejects LiqPay webhook if currency is not UAH', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'liqpay',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
        ONLINE_PAYMENTS_PUBLIC_KEY: publicKey,
      });

      const orderId = 'liqpay-order-usd';
      const payload = {
        order_id: orderId,
        status: 'success',
        amount: 100,
        currency: 'USD',
      };
      const data = Buffer.from(JSON.stringify(payload)).toString('base64');
      const expectedSig = createHash('sha1')
        .update(secret + data + secret)
        .digest('base64');

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'db-liqpay-2',
        orderId,
        provider: 'liqpay',
        status: 'pending',
        amount: 100,
        apartmentId: 'apt-1',
      });

      await expect(
        s.handleWebhook({
          data,
          signature: expectedSig,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Generic webhook signature enforcement & Idempotency', () => {
    it('throws Error on module init when provider is generic outside sandbox', () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'generic',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
      });
      expect(() => s.onModuleInit()).toThrow();
    });

    it('throws BadRequestException outside sandbox when generic webhook is invoked', async () => {
      const s = createService({
        NODE_ENV: 'production',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'generic',
        ONLINE_PAYMENTS_SANDBOX: 'false',
        ONLINE_PAYMENTS_SECRET: secret,
      });

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'gen-1',
        orderId: 'gen-123',
        provider: 'generic',
        amount: 250,
        status: 'pending',
        apartmentId: 'apt-1',
      });

      await expect(
        s.handleWebhook({
          orderId: 'gen-123',
          amount: 250,
          status: 'success',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects generic webhook when payload of order A is sent for order B', async () => {
      const s = createService({
        NODE_ENV: 'development',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'generic',
        ONLINE_PAYMENTS_SANDBOX: 'true',
        ONLINE_PAYMENTS_SECRET: secret,
      });

      const payloadA = {
        orderId: 'order-A',
        amount: 100,
        apartmentId: 'apt-1',
      };
      const dataA = Buffer.from(JSON.stringify(payloadA)).toString('base64url');
      const sigA = createHmac('sha256', secret).update(dataA).digest('hex');

      // Attacker tries to use sigA and dataA to confirm order-B with amount 500
      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'order-B-id',
        orderId: 'order-B',
        provider: 'generic',
        amount: 500,
        status: 'pending',
        apartmentId: 'apt-2',
      });

      await expect(
        s.handleWebhook({
          orderId: 'order-B',
          amount: 500,
          payload: dataA,
          signature: sigA,
          status: 'success',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns duplicate when order is already paid without creating another payment', async () => {
      const s = createService({
        NODE_ENV: 'development',
        ONLINE_PAYMENTS_ENABLED: 'true',
        ONLINE_PAYMENTS_PROVIDER: 'generic',
        ONLINE_PAYMENTS_SANDBOX: 'true',
        ONLINE_PAYMENTS_SECRET: secret,
      });

      const orderId = 'gen-already-paid';
      const sig = createHmac('sha256', secret).update(orderId).digest('hex');

      (s as any).prisma.onlinePaymentOrder.findUnique.mockResolvedValue({
        id: 'gen-paid',
        orderId,
        provider: 'generic',
        amount: 100,
        status: 'paid',
        paymentId: 'existing-payment-id',
        apartmentId: 'apt-1',
      });

      const res = await s.handleWebhook({
        orderId,
        amount: 100,
        status: 'success',
        signature: sig,
      });

      expect((res as any).ok).toBe(true);
      expect((res as any).duplicate).toBe(true);
      expect((res as any).paymentId).toBe('existing-payment-id');
      expect((s as any).payments.createPayment).not.toHaveBeenCalled();
    });
  });
});

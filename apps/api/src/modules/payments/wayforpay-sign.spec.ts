import { createHmac } from 'crypto';

/** Mirrors WayForPay Purchase signature string. */
function wayforpaySignature(
  secret: string,
  parts: {
    merchantAccount: string;
    merchantDomainName: string;
    orderReference: string;
    orderDate: string;
    amount: string;
    currency: string;
    productName: string;
    productCount: string;
    productPrice: string;
  },
) {
  const signString = [
    parts.merchantAccount,
    parts.merchantDomainName,
    parts.orderReference,
    parts.orderDate,
    parts.amount,
    parts.currency,
    parts.productName,
    parts.productCount,
    parts.productPrice,
  ].join(';');
  return createHmac('md5', secret).update(signString, 'utf8').digest('hex');
}

describe('WayForPay merchantSignature', () => {
  it('produces stable HMAC_MD5 hex', () => {
    const sig = wayforpaySignature('secret', {
      merchantAccount: 'test_merch',
      merchantDomainName: 'example.com',
      orderReference: 'order1',
      orderDate: '1609459200',
      amount: '100.00',
      currency: 'UAH',
      productName: 'Test',
      productCount: '1',
      productPrice: '100.00',
    });
    expect(sig).toMatch(/^[a-f0-9]{32}$/);
    expect(
      wayforpaySignature('secret', {
        merchantAccount: 'test_merch',
        merchantDomainName: 'example.com',
        orderReference: 'order1',
        orderDate: '1609459200',
        amount: '100.00',
        currency: 'UAH',
        productName: 'Test',
        productCount: '1',
        productPrice: '100.00',
      }),
    ).toBe(sig);
  });
});

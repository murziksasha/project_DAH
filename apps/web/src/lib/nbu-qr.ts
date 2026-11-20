import QRCode from 'qrcode';

export interface NbuQrOptions {
  recipientName: string;
  iban: string;
  amount: number;
  edrpou?: string | null;
  purpose: string;
}

/**
 * Builds standard NBU EPC payment QR payload according to
 * National Bank of Ukraine Resolution No. 3 (03.01.2020).
 *
 * Line 1: BCD (Service Tag)
 * Line 2: 002 (Version)
 * Line 3: 1 (Coding UTF-8)
 * Line 4: SCT (Credit Transfer)
 * Line 5: BIC (optional / empty)
 * Line 6: Beneficiary Name
 * Line 7: Beneficiary IBAN
 * Line 8: Amount (UAHxxx.xx)
 * Line 9: Beneficiary EDRPOU
 * Line 10: Reference (optional / empty)
 * Line 11: Payment Purpose
 */
export function buildNbuQrString(opts: NbuQrOptions): string {
  const cleanIban = opts.iban.replace(/\s+/g, '').toUpperCase();
  const cleanEdrpou = (opts.edrpou ?? '').trim();
  const cleanName = opts.recipientName.trim().slice(0, 70);
  const cleanPurpose = opts.purpose.trim().slice(0, 140);
  const formattedAmount = opts.amount > 0 ? `UAH${opts.amount.toFixed(2)}` : '';

  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    '', // BIC
    cleanName,
    cleanIban,
    formattedAmount,
    cleanEdrpou,
    '', // Reference
    cleanPurpose,
  ];

  return lines.join('\n');
}

/**
 * Generates an SVG string containing the rendered NBU payment QR code.
 */
export async function generateNbuQrSvg(opts: NbuQrOptions): Promise<string> {
  const payload = buildNbuQrString(opts);
  return QRCode.toString(payload, {
    type: 'svg',
    margin: 1,
    width: 220,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1a202c',
      light: '#ffffff',
    },
  });
}

/**
 * Generates a PNG DataURL for the NBU payment QR code.
 */
export async function generateNbuQrDataUrl(opts: NbuQrOptions): Promise<string> {
  const payload = buildNbuQrString(opts);
  return QRCode.toDataURL(payload, {
    margin: 1,
    width: 220,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1a202c',
      light: '#ffffff',
    },
  });
}

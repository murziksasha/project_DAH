'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { Modal } from '@/components/ui/Modal';
import { formatMoney } from '@/lib/money';
import { generateNbuQrDataUrl } from '@/lib/nbu-qr';
import type { BankAccountInfo } from './AccountTab';

export interface PaySheetProps {
  open: boolean;
  onClose: () => void;
  debt: number;
  bankAccounts?: BankAccountInfo[] | null;
  buildingEdrpou?: string | null;
  paymentPurpose: string;
  onlinePayEnabled: boolean;
  payBusy: boolean;
  onOnlinePay: (amount: number) => void;
  onReceipt?: () => void;
  hasReceipt?: boolean;
  copied: string;
  onCopy: (label: string, text: string) => void;
}

function buildCopyAll(opts: {
  bankName: string;
  iban: string;
  purpose: string;
  amount: number;
  edrpou?: string | null;
  description?: string | null;
}): string {
  const lines = [
    `Банк: ${opts.bankName}`,
    `IBAN: ${opts.iban}`,
    opts.edrpou ? `ЄДРПОУ: ${opts.edrpou}` : null,
    opts.description ? `Опис: ${opts.description}` : null,
    `Сума: ${formatMoney(opts.amount)}`,
    `Призначення: ${opts.purpose}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function PaySheet({
  open,
  onClose,
  debt,
  bankAccounts,
  buildingEdrpou,
  paymentPurpose,
  onlinePayEnabled,
  payBusy,
  onOnlinePay,
  onReceipt,
  hasReceipt,
  copied,
  onCopy,
}: PaySheetProps) {
  const { t } = useI18n();
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCustomAmount(debt > 0 ? String(debt) : '');
      setUseCustom(false);
    }
  }, [open, debt]);

  const amount = useMemo(() => {
    if (useCustom) {
      const n = Number(customAmount.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return debt > 0 ? debt : 0;
  }, [useCustom, customAmount, debt]);

  const primaryBank = bankAccounts?.[0] ?? null;

  useEffect(() => {
    if (!open || !primaryBank || amount <= 0) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    generateNbuQrDataUrl({
      recipientName: primaryBank.bankName || 'ОСББ',
      iban: primaryBank.iban,
      amount,
      edrpou: buildingEdrpou,
      purpose: paymentPurpose,
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [open, primaryBank, amount, buildingEdrpou, paymentPurpose]);

  return (
    <Modal open={open} title={t('residentPayTitle')} onClose={onClose}>
      <div className="pay-sheet">
        <div className="pay-sheet-amount-block">
          <div className="pay-sheet-label">{t('residentPayAmount')}</div>
          {!useCustom ? (
            <div className="pay-sheet-amount">{formatMoney(debt > 0 ? debt : 0)}</div>
          ) : (
            <label className="pay-sheet-custom">
              <span className="sr-only">{t('residentPayCustomAmount')}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                autoFocus
              />
              <span className="pay-sheet-currency">₴</span>
            </label>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setUseCustom((v) => !v)}
          >
            {useCustom ? t('residentPayUseDebt') : t('residentPayCustomAmount')}
          </button>
        </div>

        {onlinePayEnabled && amount > 0 && (
          <button
            type="button"
            className="btn pay-sheet-primary"
            disabled={payBusy || amount <= 0}
            onClick={() => onOnlinePay(amount)}
          >
            {payBusy ? t('residentPaying') : t('residentPayOnline')}
          </button>
        )}

        {primaryBank && amount > 0 && (
          <div
            className="pay-sheet-qr-block card"
            style={{
              textAlign: 'center',
              padding: '1.25rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.4rem' }}>
              {t('residentQrScanTitle')}
            </h3>
            <p className="muted small" style={{ margin: '0 auto 0.85rem', maxWidth: '340px', lineHeight: 1.4 }}>
              {t('residentQrScanDesc')}
            </p>

            {qrDataUrl ? (
              <div
                style={{
                  display: 'inline-block',
                  padding: '8px',
                  background: '#ffffff',
                  borderRadius: '10px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                  lineHeight: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="NBU Payment QR Code"
                  width={200}
                  height={200}
                  style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
                />
              </div>
            ) : (
              <div className="muted small" style={{ padding: '2rem 0' }}>Генерація QR-коду…</div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'center',
                marginTop: '0.85rem',
                flexWrap: 'wrap',
              }}
            >
              <a
                href="https://send.monobank.ua/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline"
                style={{ textDecoration: 'none' }}
              >
                {t('residentOpenMono')}
              </a>
              <a
                href="https://privat24.ua/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline"
                style={{ textDecoration: 'none' }}
              >
                {t('residentOpenPrivat')}
              </a>
            </div>
          </div>
        )}

        {primaryBank && amount > 0 && (
          <div className="pay-sheet-bank card">
            <h3 className="pay-sheet-bank-title">{t('residentBankDetails')}</h3>
            <dl className="bank-details">
              <dt>{t('residentBankName')}</dt>
              <dd>{primaryBank.bankName}</dd>
              <dt>IBAN</dt>
              <dd>
                {primaryBank.iban}{' '}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => onCopy('iban', primaryBank.iban)}
                >
                  {copied === 'iban' ? t('residentCopied') : t('residentCopy')}
                </button>
              </dd>
              {buildingEdrpou && (
                <>
                  <dt>{t('residentEdrpou')}</dt>
                  <dd>{buildingEdrpou}</dd>
                </>
              )}
              <dt>{t('residentPaymentPurpose')}</dt>
              <dd>
                {paymentPurpose}{' '}
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => onCopy('purpose', paymentPurpose)}
                >
                  {copied === 'purpose' ? t('residentCopied') : t('residentCopy')}
                </button>
              </dd>
            </dl>
            <button
              type="button"
              className="btn btn-ghost pay-sheet-copy-all"
              onClick={() =>
                onCopy(
                  'all',
                  buildCopyAll({
                    bankName: primaryBank.bankName,
                    iban: primaryBank.iban,
                    purpose: paymentPurpose,
                    amount,
                    edrpou: buildingEdrpou,
                    description: primaryBank.description,
                  }),
                )
              }
            >
              {copied === 'all' ? t('residentCopied') : t('residentCopyAll')}
            </button>
          </div>
        )}

        {hasReceipt && onReceipt && (
          <button type="button" className="btn btn-ghost" onClick={onReceipt}>
            {t('residentPdfReceipt')}
          </button>
        )}

        {amount <= 0 && (
          <p className="resident-muted">{t('residentPayNoDebt')}</p>
        )}
      </div>
    </Modal>
  );
}

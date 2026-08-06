'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { Modal } from '@/components/ui/Modal';
import { formatMoney } from '@/lib/money';
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

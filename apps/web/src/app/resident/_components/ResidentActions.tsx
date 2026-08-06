'use client';

import Link from 'next/link';
import { useI18n } from '@/components/LocaleProvider';
import { formatMoney } from '@/lib/money';

export type ResidentActionKind =
  | 'pay'
  | 'meters'
  | 'poll'
  | 'request'
  | 'announcement'
  | 'ok';

export interface ResidentAction {
  id: string;
  kind: ResidentActionKind;
  title: string;
  subtitle?: string;
  /** primary CTA styling */
  primary?: boolean;
  onClick?: () => void;
  href?: string;
}

interface Props {
  debt: number;
  advance: number;
  actions: ResidentAction[];
  onPay: () => void;
  apartmentLabel?: string;
}

export function ResidentActions({ debt, advance, actions, onPay, apartmentLabel }: Props) {
  const { t } = useI18n();
  const heroTone = debt > 0 ? 'var(--danger)' : 'var(--success)';
  const heroLabel =
    debt > 0 ? t('residentToPay') : advance > 0 ? t('residentOverpay') : t('residentNoDebt');
  const heroAmount = debt > 0 ? debt : advance > 0 ? advance : 0;

  return (
    <section className="resident-home-actions" aria-label={t('residentActionsLabel')}>
      <div className="resident-hero">
        {apartmentLabel && (
          <div className="resident-apt-badge">{apartmentLabel}</div>
        )}
        <div className="resident-hero-label">{heroLabel}</div>
        <div className="resident-hero-amount" style={{ color: heroTone }}>
          {formatMoney(heroAmount)}
        </div>
        {debt > 0 && (
          <div className="resident-hero-actions">
            <button type="button" className="btn" onClick={onPay}>
              {t('residentPayCta', { amount: formatMoney(debt) })}
            </button>
          </div>
        )}
      </div>

      {actions.length > 0 && (
        <ul className="resident-action-list">
          {actions.map((a) => {
            const className = `resident-action-card${a.primary ? ' is-primary' : ''} kind-${a.kind}`;
            const body = (
              <>
                <span className="resident-action-title">{a.title}</span>
                {a.subtitle && (
                  <span className="resident-action-sub">{a.subtitle}</span>
                )}
              </>
            );
            if (a.href) {
              return (
                <li key={a.id}>
                  <Link href={a.href} className={className}>
                    {body}
                  </Link>
                </li>
              );
            }
            return (
              <li key={a.id}>
                <button type="button" className={className} onClick={a.onClick}>
                  {body}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {actions.length === 0 && debt <= 0 && (
        <p className="resident-all-ok success-banner">{t('residentAllOk')}</p>
      )}
    </section>
  );
}

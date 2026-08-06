'use client';

import Link from 'next/link';
import { useI18n } from '@/components/LocaleProvider';

interface Props {
  email?: string;
  /** register vs login context */
  variant?: 'register' | 'login';
  onBackToLogin?: () => void;
}

/** Calm waiting state for residents after self-registration (pending approval). */
export function PendingApprovalCard({ email, variant = 'register', onBackToLogin }: Props) {
  const { t } = useI18n();

  return (
    <div className="card pending-approval-card" role="status">
      <div className="pending-approval-icon" aria-hidden>
        ⏳
      </div>
      <h2 className="pending-approval-title">{t('pendingTitle')}</h2>
      <p className="pending-approval-lead">
        {variant === 'login' ? t('pendingLoginLead') : t('pendingRegisterLead')}
      </p>
      {email && (
        <p className="pending-approval-email">
          {t('pendingEmailLabel')}: <strong>{email}</strong>
        </p>
      )}
      <ol className="pending-approval-steps">
        <li>{t('pendingStep1')}</li>
        <li>{t('pendingStep2')}</li>
        <li>{t('pendingStep3')}</li>
      </ol>
      <p className="resident-muted resident-sm">{t('pendingHint')}</p>
      <div className="pending-approval-actions">
        {variant === 'login' && onBackToLogin ? (
          <button type="button" className="btn btn-ghost" onClick={onBackToLogin}>
            {t('pendingBackLogin')}
          </button>
        ) : (
          <Link
            href={
              email
                ? `/login?pending=1&email=${encodeURIComponent(email)}`
                : '/login?pending=1'
            }
            className="btn"
            style={{ textAlign: 'center' }}
          >
            {t('registerGoLogin')}
          </Link>
        )}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

const STEPS = ['balance', 'meters', 'request'] as const;
type Step = (typeof STEPS)[number];

/**
 * First-run guided tour for residents (uses /auth/onboarding/complete).
 * Staff still use OnboardingBanner.
 */
export function ResidentTour() {
  const { t } = useI18n();
  const user = getStoredUser();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role !== 'resident') return;
    const token = getToken();
    if (!token) return;
    apiFetch<{ onboardingDone?: boolean }>('/auth/2fa/status', { token })
      .then((s) => {
        if (!s.onboardingDone) setOpen(true);
      })
      .catch(() => undefined);
  }, [user?.id, user?.role]);

  const complete = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/auth/onboarding/complete', { method: 'POST', token });
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, []);

  if (!open || user?.role !== 'resident') return null;

  const current: Step = STEPS[step] ?? 'balance';
  const isLast = step >= STEPS.length - 1;

  const title =
    current === 'balance'
      ? t('tourStepBalanceTitle')
      : current === 'meters'
        ? t('tourStepMetersTitle')
        : t('tourStepRequestTitle');
  const body =
    current === 'balance'
      ? t('tourStepBalanceBody')
      : current === 'meters'
        ? t('tourStepMetersBody')
        : t('tourStepRequestBody');
  const href =
    current === 'balance'
      ? '/resident?tab=account'
      : current === 'meters'
        ? '/resident/meters'
        : '/resident?tab=requests&new=1';

  return (
    <div className="resident-tour-overlay" role="dialog" aria-modal="true" aria-label={t('tourTitle')}>
      <div className="resident-tour-card card">
        <div className="resident-tour-progress">
          {STEPS.map((s, i) => (
            <span key={s} className={`resident-tour-dot${i <= step ? ' is-on' : ''}`} />
          ))}
        </div>
        <p className="resident-tour-step-label">
          {t('tourStepOf', { current: step + 1, total: STEPS.length })}
        </p>
        <h2 className="resident-tour-title">{title}</h2>
        <p className="resident-tour-body">{body}</p>
        <div className="resident-tour-actions">
          <Link href={href} className="btn" onClick={() => undefined}>
            {t('tourOpen')}
          </Link>
          {!isLast ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s + 1)}>
              {t('tourNext')}
            </button>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => void complete()}>
              {busy ? t('loading') : t('tourFinish')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void complete()}
          >
            {t('tourSkip')}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

function dismiss2faStorageKey(userId: string) {
  return `dah-dismiss-2fa-banner:${userId}`;
}

function sessionHide2faKey(userId: string) {
  return `dah-hide-2fa-banner-session:${userId}`;
}

function is2faBannerSuppressed(userId: string): boolean {
  try {
    if (localStorage.getItem(dismiss2faStorageKey(userId)) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    if (sessionStorage.getItem(sessionHide2faKey(userId)) === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function OnboardingBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [require2fa, setRequire2fa] = useState(false);
  const [securityVisible, setSecurityVisible] = useState(false);
  const user = getStoredUser();
  const isResident = user?.role === 'resident';
  const securityHref = isResident ? '/resident/security' : '/admin/security';

  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;

    const applyRequired = (required?: boolean) => {
      if (!required) {
        setRequire2fa(false);
        setSecurityVisible(false);
        return;
      }
      setRequire2fa(true);
      setSecurityVisible(!is2faBannerSuppressed(user.id));
    };

    // Residents use ResidentTour instead of welcome onboarding card
    if (user.role === 'resident') {
      apiFetch<{ required?: boolean }>('/auth/2fa/status', { token })
        .then((s) => applyRequired(s.required))
        .catch(() => undefined);
      return;
    }
    apiFetch<{
      onboardingDone?: boolean;
      required?: boolean;
      totpEnabled?: boolean;
    }>('/auth/2fa/status', { token })
      .then((s) => {
        applyRequired(s.required);
        if (!s.onboardingDone) setShow(true);
      })
      .catch(() => undefined);
  }, [user?.id, user?.role]);

  const showSecurity = require2fa && securityVisible;
  if (isResident && !showSecurity) return null;
  if (!show && !showSecurity) return null;

  async function dismissOnboarding() {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch('/auth/onboarding/complete', { method: 'POST', token });
      setShow(false);
    } catch {
      setShow(false);
    }
  }

  function hideSecuritySession() {
    if (!user) return;
    try {
      sessionStorage.setItem(sessionHide2faKey(user.id), '1');
    } catch {
      /* ignore */
    }
    setSecurityVisible(false);
  }

  function dismissSecurityForever() {
    if (!user) return;
    try {
      localStorage.setItem(dismiss2faStorageKey(user.id), '1');
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(sessionHide2faKey(user.id));
    } catch {
      /* ignore */
    }
    setSecurityVisible(false);
  }

  return (
    <div
      className="card onboarding-banner"
      style={{
        margin: '0.75rem 1rem 0',
        borderColor: showSecurity ? 'var(--warning)' : 'var(--primary)',
        background: 'var(--surface)',
      }}
      role="region"
      aria-label={showSecurity ? t('securityBannerAria') : t('onboardingBannerAria')}
    >
      {showSecurity && (
        <div className="onboarding-banner-security">
          <p style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <strong>{t('securityShort')}:</strong> {t('securityBannerBody')}{' '}
            <Link href={securityHref}>{t('securityBannerEnable')}</Link>
          </p>
          <div className="onboarding-banner-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={hideSecuritySession}>
              {t('securityBannerHide')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismissSecurityForever}>
              {t('securityBannerDontShow')}
            </button>
          </div>
        </div>
      )}
      {show && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            marginTop: showSecurity ? '0.65rem' : 0,
          }}
        >
          <span style={{ flex: 1, minWidth: 200 }}>{t('onboardingWelcome')}</span>
          <Link href={user?.role === 'resident' ? '/resident' : '/admin'} className="btn btn-sm">
            {t('onboardingNext')}
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void dismissOnboarding()}>
            {t('onboardingGotIt')}
          </button>
        </div>
      )}
    </div>
  );
}

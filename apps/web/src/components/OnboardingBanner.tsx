'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

export function OnboardingBanner() {
  const [show, setShow] = useState(false);
  const [require2fa, setRequire2fa] = useState(false);
  const user = getStoredUser();

  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;
    apiFetch<{
      onboardingDone?: boolean;
      required?: boolean;
      totpEnabled?: boolean;
    }>('/auth/2fa/status', { token })
      .then((s) => {
        if (s.required) setRequire2fa(true);
        if (!s.onboardingDone) setShow(true);
      })
      .catch(() => undefined);
  }, [user?.id]);

  if (!show && !require2fa) return null;

  async function dismiss() {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch('/auth/onboarding/complete', { method: 'POST', token });
      setShow(false);
    } catch {
      setShow(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        margin: '0.75rem 1rem 0',
        borderColor: require2fa ? 'var(--warning)' : 'var(--primary)',
        background: 'var(--surface)',
      }}
    >
      {require2fa && (
        <p style={{ margin: '0 0 0.5rem' }}>
          <strong>Безпека:</strong> для фінансових операцій потрібна 2FA.{' '}
          <Link href="/admin/security">Увімкнути зараз</Link>
        </p>
      )}
      {show && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            Ласкаво просимо! Перегляньте рахунок, увімкніть сповіщення та змініть пароль за потреби.
          </span>
          <Link href={user?.role === 'resident' ? '/resident' : '/admin'} className="btn btn-sm">
            Далі
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void dismiss()}>
            Зрозуміло
          </button>
        </div>
      )}
    </div>
  );
}

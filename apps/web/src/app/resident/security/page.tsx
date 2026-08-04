'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { SessionsPanel } from '@/components/SessionsPanel';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { logout } from '@/lib/auth';
import {
  canUsePush,
  getPushSubscriptionStatus,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push';

export default function ResidentSecurityPage() {
  const { t } = useI18n();
  const [emailNotify, setEmailNotify] = useState(true);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: string;
    subscribed: boolean;
    configured: boolean;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    try {
      const [s, p, profile] = await Promise.all([
        apiFetch<{ emailNotifyEnabled: boolean }>('/auth/2fa/status', { token }),
        getPushSubscriptionStatus(),
        apiFetch<{
          phone: string | null;
          firstName: string;
          lastName: string;
          emailNotifyEnabled?: boolean;
        }>('/auth/profile', { token }),
      ]);
      setEmailNotify(s.emailNotifyEnabled);
      setPushStatus(p);
      setPhone(profile.phone ?? '');
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }, [t]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function toggleEmail() {
    const token = getToken();
    if (!token) return;
    try {
      const next = !emailNotify;
      await apiFetch('/auth/email-notify', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ enabled: next }),
      });
      setEmailNotify(next);
      setMessage(next ? t('residentEmailEnabledMsg') : t('residentEmailDisabledMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const updated = await apiFetch<{
        firstName: string;
        lastName: string;
        phone: string | null;
        email: string;
        role: string;
        id: string;
      }>('/auth/profile', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone.trim() || null,
        }),
      });
      setMessage(t('residentProfileSaved'));
      const prev = localStorage.getItem('dah_user');
      if (prev) {
        try {
          const u = JSON.parse(prev) as Record<string, unknown>;
          localStorage.setItem(
            'dah_user',
            JSON.stringify({
              ...u,
              firstName: updated.firstName,
              lastName: updated.lastName,
            }),
          );
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      setError(t('residentPasswordMismatch'));
      return;
    }
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        token,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMessage(t('residentPasswordChanged'));
      setTimeout(() => logout(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      setLoading(false);
    }
  }

  return (
    <main>
      <PageHeader title={t('residentSecurityTitle')} description={t('residentSecurityDesc')} />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>{t('residentProfilePhone')}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          {t('residentProfilePhoneHint')}
        </p>
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <label>{t('firstName')}</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label>{t('lastName')}</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div>
            <label>{t('phone')}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+380501112233"
            />
          </div>
          <button type="submit" disabled={loading}>
            {t('residentSaveProfile')}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>{t('securitySessions')}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          {t('securitySessionsDesc')}
        </p>
        <SessionsPanel />
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>{t('residentChangePassword')}</h2>
        <form onSubmit={changePassword} style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <label>{t('securityCurrentPassword')}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label>{t('securityNewPassword')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label>{t('residentPasswordRepeat')}</label>
            <input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button type="submit" disabled={loading}>
            {t('residentChange')}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{t('email')}</h2>
        <button type="button" className="btn btn-sm" onClick={toggleEmail}>
          {emailNotify ? t('residentEmailToggleOff') : t('residentEmailToggleOn')}
        </button>
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{t('securityPush')}</h2>
        {!canUsePush() || !pushStatus?.supported ? (
          <p style={{ color: 'var(--muted)' }}>{t('residentPushUnsupported')}</p>
        ) : !pushStatus.configured ? (
          <p style={{ color: 'var(--muted)' }}>{t('residentPushNotConfigured')}</p>
        ) : (
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              try {
                if (pushStatus.subscribed) await unsubscribeFromPush();
                else await subscribeToPush();
                setMessage(
                  pushStatus.subscribed ? t('residentPushOffMsg') : t('residentPushOnMsg'),
                );
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : t('error'));
              }
            }}
          >
            {pushStatus.subscribed ? t('securityPushDisable') : t('securityPushEnable')}
          </button>
        )}
      </section>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { SessionsPanel } from '@/components/SessionsPanel';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { apiFetch, getToken } from '@/lib/api';
import { logout } from '@/lib/auth';
import { getStoredComfort, toggleComfort, type ComfortMode } from '@/lib/comfort';
import {
  canUsePush,
  getPushSubscriptionStatus,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push';
import { getQuietHours, setQuietHours, type QuietHours } from '@/lib/push-quiet-hours';

export default function ResidentSecurityPage() {
  const { t } = useI18n();
  const [emailNotify, setEmailNotify] = useState(true);
  const [quiet, setQuiet] = useState<QuietHours>({ enabled: false, startHour: 22, endHour: 8 });
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
  const [comfort, setComfort] = useState<ComfortMode>('normal');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

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
      setQuiet(getQuietHours());
      setPhone(profile.phone ?? '');
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setComfort(getStoredComfort());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setPageLoading(false);
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

  function onComfortToggle() {
    const next = toggleComfort();
    setComfort(next);
    setMessage(next === 'large' ? t('comfortLarge') : t('comfortNormal'));
  }

  return (
    <main className="resident-security">
      <Link href="/resident" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        {t('residentBackCabinet')}
      </Link>
      <PageHeader title={t('residentSecurityTitle')} description={t('residentSecurityDesc')} />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}
      {pageLoading && <SkeletonCards count={2} />}

      {!pageLoading && (
        <>
          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="resident-section-title">{t('residentComfortSection')}</h2>
            <p className="resident-muted resident-sm" style={{ marginBottom: '0.75rem' }}>
              {t('residentComfortHint')}
            </p>
            <button
              type="button"
              className="btn"
              aria-pressed={comfort === 'large'}
              onClick={onComfortToggle}
            >
              {comfort === 'large' ? t('comfortNormal') : t('comfortLarge')}
            </button>
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="resident-section-title">{t('residentProfilePhone')}</h2>
            <p className="resident-muted resident-sm" style={{ marginBottom: '0.75rem' }}>
              {t('residentProfilePhoneHint')}
            </p>
            <form onSubmit={saveProfile} style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label htmlFor="sec-first">{t('firstName')}</label>
                <input
                  id="sec-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="sec-last">{t('lastName')}</label>
                <input
                  id="sec-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
              </div>
              <div>
                <label htmlFor="sec-phone">{t('phone')}</label>
                <input
                  id="sec-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+380501112233"
                  autoComplete="tel"
                />
              </div>
              <button type="submit" className="btn" disabled={loading}>
                {t('residentSaveProfile')}
              </button>
            </form>
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="resident-section-title">{t('securitySessions')}</h2>
            <p className="resident-muted resident-sm" style={{ marginBottom: '0.75rem' }}>
              {t('securitySessionsDesc')}
            </p>
            <SessionsPanel />
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="resident-section-title">{t('residentChangePassword')}</h2>
            <form onSubmit={changePassword} style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <label htmlFor="sec-cur">{t('securityCurrentPassword')}</label>
                <input
                  id="sec-cur"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label htmlFor="sec-new">{t('securityNewPassword')}</label>
                <input
                  id="sec-new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="sec-new2">{t('residentPasswordRepeat')}</label>
                <input
                  id="sec-new2"
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn" disabled={loading}>
                {t('residentChange')}
              </button>
            </form>
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="resident-section-title">{t('email')}</h2>
            <p className="resident-muted resident-sm" style={{ marginBottom: '0.5rem' }}>
              {t('residentEmailNotifyHint')}
            </p>
            <button type="button" className="btn btn-sm" onClick={() => void toggleEmail()}>
              {emailNotify ? t('residentEmailToggleOff') : t('residentEmailToggleOn')}
            </button>
          </section>

          <section className="card">
            <h2 className="resident-section-title">{t('securityPush')}</h2>
            <p className="resident-muted resident-sm" style={{ marginBottom: '0.5rem' }}>
              {t('residentPushHint')}
            </p>
            {!canUsePush() || !pushStatus?.supported ? (
              <p className="resident-muted">{t('residentPushUnsupported')}</p>
            ) : !pushStatus.configured ? (
              <p className="resident-muted">{t('residentPushNotConfigured')}</p>
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
            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={quiet.enabled}
                  onChange={(e) => {
                    const next = { ...quiet, enabled: e.target.checked };
                    setQuiet(next);
                    setQuietHours(next);
                  }}
                />
                Тихий режим push (локально, {quiet.startHour}:00–{quiet.endHour}:00)
              </label>
              {quiet.enabled && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label>
                    З
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={quiet.startHour}
                      onChange={(e) => {
                        const next = {
                          ...quiet,
                          startHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                        };
                        setQuiet(next);
                        setQuietHours(next);
                      }}
                      style={{ width: 64, marginLeft: 6 }}
                    />
                  </label>
                  <label>
                    До
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={quiet.endHour}
                      onChange={(e) => {
                        const next = {
                          ...quiet,
                          endHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)),
                        };
                        setQuiet(next);
                        setQuietHours(next);
                      }}
                      style={{ width: 64, marginLeft: 6 }}
                    />
                  </label>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

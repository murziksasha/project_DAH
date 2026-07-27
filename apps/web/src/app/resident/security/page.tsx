'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
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
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }, []);

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
      setMessage(next ? 'Email увімкнено' : 'Email вимкнено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
      setMessage('Профіль збережено');
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
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      setError('Нові паролі не збігаються');
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
      setMessage('Пароль змінено. Увійдіть знову…');
      setTimeout(() => logout(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
      setLoading(false);
    }
  }

  return (
    <main>
      <PageHeader title="Безпека" description="Профіль, телефон для SMS-входу, пароль" />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Профіль і телефон</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Телефон потрібен для входу по SMS (якщо увімкнено на сервері).
        </p>
        <form onSubmit={saveProfile} style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <label>Імʼя</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label>Прізвище</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div>
            <label>Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+380501112233"
            />
          </div>
          <button type="submit" disabled={loading}>
            Зберегти профіль
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Зміна пароля</h2>
        <form onSubmit={changePassword} style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <label>Поточний пароль</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label>Новий пароль</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label>Повтор</label>
            <input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button type="submit" disabled={loading}>
            Змінити
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Email</h2>
        <button type="button" className="btn btn-sm" onClick={toggleEmail}>
          {emailNotify ? 'Вимкнути email-сповіщення' : 'Увімкнути email-сповіщення'}
        </button>
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Web Push</h2>
        {!canUsePush() || !pushStatus?.supported ? (
          <p style={{ color: 'var(--muted)' }}>Не підтримується в цьому браузері</p>
        ) : !pushStatus.configured ? (
          <p style={{ color: 'var(--muted)' }}>Push не налаштовано на сервері</p>
        ) : (
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              try {
                if (pushStatus.subscribed) await unsubscribeFromPush();
                else await subscribeToPush();
                setMessage(pushStatus.subscribed ? 'Push вимкнено' : 'Push увімкнено');
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Помилка');
              }
            }}
          >
            {pushStatus.subscribed ? 'Вимкнути push' : 'Увімкнути push'}
          </button>
        )}
      </section>
    </main>
  );
}

'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { logout, logoutAll } from '@/lib/auth';
import {
  canUsePush,
  getPushSubscriptionStatus,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push';

interface TwoFaStatus {
  totpEnabled: boolean;
  available: boolean;
  emailNotifyEnabled: boolean;
}

interface MailStatus {
  smtpConfigured: boolean;
  appUrl: string;
  mode: string;
}

export default function SecurityPage() {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<TwoFaStatus | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qrUrl: string } | null>(
    null,
  );
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
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
      const [s, m, p, profile] = await Promise.all([
        apiFetch<TwoFaStatus>('/auth/2fa/status', { token }),
        apiFetch<MailStatus>('/mail/status', { token }).catch(() => null),
        getPushSubscriptionStatus(),
        apiFetch<{ phone: string | null }>('/auth/profile', { token }).catch(() => ({
          phone: null as string | null,
        })),
      ]);
      setStatus(s);
      setMail(m);
      setPushStatus(p);
      setPhone(profile.phone ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function startSetup() {
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await apiFetch<{ secret: string; otpauthUrl: string; qrUrl: string }>(
        '/auth/2fa/setup',
        { method: 'POST', token },
      );
      setSetup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await apiFetch('/auth/2fa/enable', {
        method: 'POST',
        token,
        body: JSON.stringify({ code }),
      });
      setMessage('2FA увімкнено');
      setSetup(null);
      setCode('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await apiFetch('/auth/2fa/disable', {
        method: 'POST',
        token,
        body: JSON.stringify({ password, code: code || undefined }),
      });
      setMessage('2FA вимкнено');
      setPassword('');
      setCode('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function toggleEmail() {
    if (!status) return;
    const token = getToken();
    if (!token) return;
    try {
      const next = !status.emailNotifyEnabled;
      await apiFetch('/auth/email-notify', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ enabled: next }),
      });
      setStatus({ ...status, emailNotifyEnabled: next });
      setMessage(next ? 'Email-сповіщення увімкнено' : 'Email-сповіщення вимкнено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function sendTestMail() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await apiFetch<{ ok: boolean; skipped?: boolean; to: string }>('/mail/test', {
        method: 'POST',
        token,
      });
      setMessage(
        res.skipped
          ? `Тест записано в журнал (SMTP не налаштовано), to=${res.to}`
          : `Лист надіслано на ${res.to}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      setMessage('Пароль змінено. Потрібен повторний вхід…');
      setTimeout(() => logout(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
      setLoading(false);
    }
  }

  async function enablePush() {
    setError('');
    try {
      await subscribeToPush();
      setMessage('Web Push увімкнено');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка push');
    }
  }

  async function disablePush() {
    setError('');
    try {
      await unsubscribeFromPush();
      setMessage('Web Push вимкнено');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main>
      <PageHeader
        title="Безпека та сповіщення"
        description="Пароль, 2FA (TOTP), email і Web Push"
      />

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Телефон (SMS-вхід)</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="phone">Номер</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+380..."
            />
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={loading}
            onClick={async () => {
              const token = getToken();
              if (!token) return;
              setLoading(true);
              try {
                await apiFetch('/auth/profile', {
                  method: 'PATCH',
                  token,
                  body: JSON.stringify({ phone: phone.trim() || null }),
                });
                setMessage('Телефон збережено');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Помилка');
              } finally {
                setLoading(false);
              }
            }}
          >
            Зберегти
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Сесії</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Refresh-токени з ротацією (HttpOnly cookie). Завершіть усі сесії на інших пристроях.
        </p>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void logoutAll().finally(() => setLoading(false));
          }}
        >
          Вийти скрізь
        </button>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Зміна пароля</h2>
        <form onSubmit={changePassword} style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
          <div>
            <label htmlFor="cur">Поточний пароль</label>
            <input
              id="cur"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="np">Новий пароль</label>
            <input
              id="np"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="np2">Повтор нового пароля</label>
            <input
              id="np2"
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" disabled={loading}>
            Змінити пароль
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Email-сповіщення</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Реєстрація, нарахування, платежі, оголошення, заявки, нагадування про борг.
          {mail && (
            <>
              {' '}
              Режим: <strong>{mail.mode}</strong>
              {mail.smtpConfigured ? ' (SMTP)' : ' (лог без SMTP)'}.
            </>
          )}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" className="btn btn-sm" onClick={toggleEmail} disabled={!status}>
            {status?.emailNotifyEnabled ? 'Вимкнути для мене' : 'Увімкнути для мене'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={sendTestMail}>
            Надіслати тест
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Web Push</h2>
        {!canUsePush() || !pushStatus?.supported ? (
          <p style={{ color: 'var(--muted)' }}>Браузер не підтримує push-сповіщення.</p>
        ) : !pushStatus.configured ? (
          <p style={{ color: 'var(--muted)' }}>
            VAPID ключі не налаштовані на сервері (див. .env).
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
              Дозвіл: <strong>{pushStatus.permission}</strong>
              {' · '}
              Підписка: <strong>{pushStatus.subscribed ? 'активна' : 'немає'}</strong>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {!pushStatus.subscribed ? (
                <button type="button" className="btn btn-sm" onClick={enablePush}>
                  Увімкнути push
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-ghost" onClick={disablePush}>
                  Вимкнути push
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>2FA (TOTP)</h2>
        {!status?.available ? (
          <p style={{ color: 'var(--muted)' }}>
            2FA доступна для ролей правління та адміністраторів. Мешканцям — лише email/push.
          </p>
        ) : status.totpEnabled ? (
          <form onSubmit={disable} style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
            <p style={{ color: 'var(--success)' }}>2FA увімкнено</p>
            <div>
              <label htmlFor="pwd">Пароль</label>
              <input
                id="pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="code-off">Код з додатку</label>
              <input
                id="code-off"
                inputMode="numeric"
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-ghost" disabled={loading}>
              Вимкнути 2FA
            </button>
          </form>
        ) : setup ? (
          <form onSubmit={enable} style={{ display: 'grid', gap: '0.75rem', maxWidth: 420 }}>
            <p style={{ fontSize: '0.9rem' }}>
              Відскануйте QR у Google Authenticator / Authy або введіть секрет вручну.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qrUrl}
              alt="QR 2FA"
              width={180}
              height={180}
              style={{ background: '#fff', padding: 8, borderRadius: 8 }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <code style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{setup.secret}</code>
            <div>
              <label htmlFor="code-on">Код підтвердження</label>
              <input
                id="code-on"
                inputMode="numeric"
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={loading}>
              Підтвердити та увімкнути
            </button>
          </form>
        ) : (
          <button type="button" onClick={startSetup} disabled={loading}>
            Налаштувати 2FA
          </button>
        )}
      </section>
    </main>
  );
}

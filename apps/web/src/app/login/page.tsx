'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, LoginResponse, persistAccessToken } from '@/lib/api';

const ADMIN_ROLES = ['chairman', 'accountant', 'board', 'auditor'];

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return process.env.NODE_ENV === 'development';
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.startsWith('/login') || raw.startsWith('/register')) return null;
  return raw;
}

async function finishLogin(data: LoginResponse) {
  if (!data.accessToken) {
    throw new Error('Неповна відповідь сервера');
  }
  persistAccessToken(data.accessToken);
  localStorage.setItem('dah_user', JSON.stringify(data.user));
  localStorage.removeItem('dah_refresh');

  const next = safeNextPath(new URLSearchParams(window.location.search).get('next'));

  let target = '/resident';
  if (data.user.role === 'super_admin') {
    const status = await apiFetch<{ isInitialized: boolean }>('/setup/status', {
      token: data.accessToken,
    });
    target = status.isInitialized ? '/admin/organization' : '/admin/setup';
  } else if (ADMIN_ROLES.includes(data.user.role)) {
    target = '/admin';
  }

  if (next) {
    if (data.user.role === 'resident' && next.startsWith('/resident')) target = next;
    if (ADMIN_ROLES.includes(data.user.role) && next.startsWith('/admin')) target = next;
    if (data.user.role === 'super_admin' && next.startsWith('/admin')) target = next;
  }

  window.location.href = target;
}

type Mode = 'password' | 'sms' | '2fa';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [code, setCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemoHints, setShowDemoHints] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [identityAvailable, setIdentityAvailable] = useState(false);
  const [identityProvider, setIdentityProvider] = useState('mock');

  useEffect(() => {
    if (isLocalHost()) {
      setEmail('chairman@osbb.local');
      setPassword('password123');
      setShowDemoHints(true);
    }
    apiFetch<{ enabled: boolean }>('/sms/status', { skipAuth: true })
      .then((s) => setSmsAvailable(Boolean(s.enabled)))
      .catch(() => setSmsAvailable(false));
    apiFetch<{ enabled: boolean; provider?: string }>('/identity/status', { skipAuth: true })
      .then((s) => {
        setIdentityAvailable(Boolean(s.enabled));
        setIdentityProvider(s.provider ?? 'mock');
      })
      .catch(() => setIdentityAvailable(false));

    // Identity callback: /login?identity=callback&state=...&email=...
    const params = new URLSearchParams(window.location.search);
    if (params.get('identity') === 'callback' && params.get('state')) {
      setLoading(true);
      apiFetch<LoginResponse>('/identity/callback', {
        method: 'POST',
        body: JSON.stringify({
          state: params.get('state'),
          code: params.get('code') ?? undefined,
          email: params.get('email') ?? undefined,
          phone: params.get('phone') ?? undefined,
        }),
      })
        .then((data) => finishLogin(data))
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Помилка Diia/BankID');
          setLoading(false);
        });
    }
  }, []);

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (data.requires2fa && data.tempToken) {
        setTempToken(data.tempToken);
        setMode('2fa');
        return;
      }
      await finishLogin(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка входу');
    } finally {
      setLoading(false);
    }
  }

  async function handleSmsRequest(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string }>('/auth/login/sms/request', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setSmsSent(true);
      setMessage(res.message ?? 'Код надіслано (якщо номер у системі)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка SMS');
    } finally {
      setLoading(false);
    }
  }

  async function handleSmsVerify(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<LoginResponse>('/auth/login/sms/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, code: smsCode }),
      });
      if (data.requires2fa && data.tempToken) {
        setTempToken(data.tempToken);
        setMode('2fa');
        return;
      }
      await finishLogin(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невірний код');
    } finally {
      setLoading(false);
    }
  }

  async function handleIdentity() {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ authorizeUrl: string }>('/identity/authorize', {
        method: 'POST',
        body: JSON.stringify({ returnTo: window.location.pathname }),
      });
      window.location.href = res.authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identity недоступний');
      setLoading(false);
    }
  }

  async function handle2fa(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<LoginResponse>('/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ tempToken, code }),
      });
      await finishLogin(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Невірний код 2FA');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Вхід</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>Мій дім — кабінет ОСББ та УК</p>

      {mode !== '2fa' && smsAvailable && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          <button
            type="button"
            className={`btn btn-sm${mode === 'password' ? '' : ' btn-ghost'}`}
            onClick={() => {
              setMode('password');
              setError('');
            }}
          >
            Email
          </button>
          <button
            type="button"
            className={`btn btn-sm${mode === 'sms' ? '' : ' btn-ghost'}`}
            onClick={() => {
              setMode('sms');
              setError('');
            }}
          >
            SMS
          </button>
        </div>
      )}

      {mode === 'password' && (
        <form onSubmit={handlePassword} className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Вхід…' : 'Увійти'}
          </button>
          {identityAvailable && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading}
              onClick={() => void handleIdentity()}
            >
              {identityProvider === 'diia'
                ? 'Увійти через Дію'
                : identityProvider === 'bankid'
                  ? 'Увійти через BankID'
                  : 'Увійти через Дію / BankID (mock)'}
            </button>
          )}
        </form>
      )}

      {mode === 'sms' && (
        <form
          onSubmit={smsSent ? handleSmsVerify : handleSmsRequest}
          className="card"
          style={{ display: 'grid', gap: '1rem' }}
        >
          <div>
            <label htmlFor="phone">Телефон</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+380..."
              required
              autoComplete="tel"
            />
          </div>
          {smsSent && (
            <div>
              <label htmlFor="sms-code">Код з SMS</label>
              <input
                id="sms-code"
                inputMode="numeric"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                required
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>
          )}
          {message && <p className="success-banner">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '…' : smsSent ? 'Увійти' : 'Надіслати код'}
          </button>
          {smsSent && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSmsSent(false);
                setSmsCode('');
              }}
            >
              Змінити номер
            </button>
          )}
        </form>
      )}

      {mode === '2fa' && (
        <form onSubmit={handle2fa} className="card" style={{ display: 'grid', gap: '1rem' }}>
          <p style={{ fontSize: '0.95rem' }}>
            Введіть 6-значний код з додатку-аутентифікатора (2FA).
          </p>
          <div>
            <label htmlFor="code">Код 2FA</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Перевірка…' : 'Підтвердити'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setMode('password');
              setTempToken('');
              setCode('');
              setError('');
            }}
          >
            Назад
          </button>
        </form>
      )}

      {showDemoHints && mode === 'password' && (
        <p style={{ marginTop: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Демо: chairman@osbb.local / password123
          <br />
          Супер-адмін: admin@dah.local / password123
        </p>
      )}
      <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        Немає облікового запису? <Link href="/register">Зареєструватися</Link>
      </p>
    </main>
  );
}

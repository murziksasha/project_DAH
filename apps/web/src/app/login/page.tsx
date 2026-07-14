'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, LoginResponse } from '@/lib/api';
import { setAuthCookie } from '@/lib/auth-cookie';

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
  if (!data.accessToken || !data.refreshToken) {
    throw new Error('Неповна відповідь сервера');
  }
  localStorage.setItem('dah_token', data.accessToken);
  localStorage.setItem('dah_refresh', data.refreshToken);
  localStorage.setItem('dah_user', JSON.stringify(data.user));
  setAuthCookie(data.accessToken);
  window.dispatchEvent(new Event('dah-auth-change'));

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

  // Respect ?next= only if role-compatible
  if (next) {
    if (data.user.role === 'resident' && next.startsWith('/resident')) target = next;
    if (ADMIN_ROLES.includes(data.user.role) && next.startsWith('/admin')) target = next;
    if (data.user.role === 'super_admin' && next.startsWith('/admin')) target = next;
  }

  window.location.href = target;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [step, setStep] = useState<'password' | '2fa'>('password');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemoHints, setShowDemoHints] = useState(false);

  useEffect(() => {
    if (isLocalHost()) {
      setEmail('chairman@osbb.local');
      setPassword('password123');
      setShowDemoHints(true);
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
        setStep('2fa');
        return;
      }
      await finishLogin(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка входу');
    } finally {
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
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>DAH — кабінет ОСМД</p>

      {step === 'password' ? (
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
        </form>
      ) : (
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
              setStep('password');
              setTempToken('');
              setCode('');
              setError('');
            }}
          >
            Назад
          </button>
        </form>
      )}

      {showDemoHints && step === 'password' && (
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

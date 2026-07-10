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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLocalHost()) {
      setEmail('chairman@osbb.local');
      setPassword('password123');
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('dah_token', data.accessToken);
      localStorage.setItem('dah_refresh', data.refreshToken);
      localStorage.setItem('dah_user', JSON.stringify(data.user));
      setAuthCookie(data.accessToken);
      window.dispatchEvent(new Event('dah-auth-change'));

      let target = '/resident';
      if (data.user.role === 'super_admin') {
        const status = await apiFetch<{ isInitialized: boolean }>('/setup/status', {
          token: data.accessToken,
        });
        target = status.isInitialized ? '/admin/organization' : '/admin/setup';
      } else if (ADMIN_ROLES.includes(data.user.role)) {
        target = '/admin';
      }

      // Full navigation so middleware receives the auth cookie
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка входу');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Вхід</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>DAH — кабінет ОСМД</p>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="password">Пароль</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Вхід...' : 'Увійти'}
        </button>
      </form>

      <p style={{ marginTop: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
        Демо: chairman@osbb.local / password123
        <br />
        Супер-адмін: admin@dah.local / password123
      </p>
      <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        Немає облікового запису? <Link href="/register">Зареєструватися</Link>
      </p>
    </main>
  );
}
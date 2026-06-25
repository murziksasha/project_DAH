'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiFetch, LoginResponse } from '@/lib/api';

const ADMIN_ROLES = ['chairman', 'accountant', 'board', 'auditor'];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('chairman@osbb.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      localStorage.setItem('dah_user', JSON.stringify(data.user));

      if (ADMIN_ROLES.includes(data.user.role)) {
        router.push('/admin');
      } else {
        router.push('/resident');
      }
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
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Вхід...' : 'Увійти'}
        </button>
      </form>

      <p style={{ marginTop: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
        Демо: chairman@osbb.local / password123
      </p>
    </main>
  );
}
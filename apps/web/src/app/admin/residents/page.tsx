'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface PendingUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  createdAt: string;
  apartment: { entrance: number; number: string } | null;
}

const APPROVER_ROLES = ['chairman', 'board'];

function getCurrentUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('dah_user');
    if (!raw) return null;
    return (JSON.parse(raw) as { role: string }).role;
  } catch {
    return null;
  }
}

export default function ResidentsPage() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const canApprove = APPROVER_ROLES.includes(getCurrentUserRole() ?? '');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<PendingUser[]>('/auth/pending', { token });
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function handleApprove(id: string) {
    const token = getToken();
    if (!token) return;
    setApprovingId(id);
    setMessage('');
    setError('');
    try {
      await apiFetch(`/auth/approve/${id}`, { method: 'PATCH', token });
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setMessage('Мешканця підтверджено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка підтвердження');
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <main>
      <h1 style={{ marginBottom: '0.5rem' }}>Заявки на реєстрацію</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Мешканці, які очікують підтвердження від правління
      </p>

      {!canApprove && (
        <p className="card" style={{ marginBottom: '1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Підтверджувати можуть лише голова правління або члени правління. Ви можете переглядати
          список, але кнопка «Підтвердити» недоступна.
        </p>
      )}

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => load()} disabled={loading}>
          {loading ? 'Оновлення…' : 'Оновити'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)', marginBottom: '1rem' }}>{message}</p>}

      <section className="card">
        {loading && users.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
        ) : users.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Немає заявок на підтвердження</p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '1rem' }}>
            {users.map((user) => (
              <li
                key={user.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    {user.firstName} {user.lastName}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{user.email}</div>
                  {user.phone && (
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{user.phone}</div>
                  )}
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                    {user.apartment
                      ? `Під'їзд ${user.apartment.entrance}, кв. ${user.apartment.number}`
                      : 'Квартира не вказана'}
                    {' · '}
                    {new Date(user.createdAt).toLocaleString('uk-UA')}
                  </div>
                </div>
                {canApprove && (
                  <button
                    type="button"
                    onClick={() => handleApprove(user.id)}
                    disabled={approvingId === user.id}
                    style={{ flexShrink: 0 }}
                  >
                    {approvingId === user.id ? 'Підтвердження…' : 'Підтвердити'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
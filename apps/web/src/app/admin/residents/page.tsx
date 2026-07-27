'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk } from '@/lib/money';

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
  const [busyId, setBusyId] = useState<string | null>(null);
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
    setBusyId(id);
    setMessage('');
    setError('');
    try {
      await apiFetch(`/auth/approve/${id}`, { method: 'PATCH', token });
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setMessage('Мешканця підтверджено — можна входити в кабінет');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка підтвердження');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    const token = getToken();
    if (!token) return;
    const ok = window.confirm(
      'Відхилити заявку? Обліковий запис буде заблоковано. Мешканець зможе звернутися до правління.',
    );
    if (!ok) return;
    setBusyId(id);
    setMessage('');
    setError('');
    try {
      await apiFetch(`/auth/reject/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ reason: 'Відхилено правлінням' }),
      });
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setMessage('Заявку відхилено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка відхилення');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main>
      <PageHeader
        title="Заявки мешканців"
        description="Підтвердження самостійної реєстрації (/register)"
        actions={
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => load()} disabled={loading}>
            {loading ? 'Оновлення…' : 'Оновити'}
          </button>
        }
      />

      {!canApprove && (
        <p className="card" style={{ marginBottom: '1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Підтверджувати можуть лише голова правління або члени правління. Ви можете переглядати
          список.
        </p>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <section className="card">
        {loading && users.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
        ) : users.length === 0 ? (
          <EmptyState
            title="Немає заявок"
            description="Коли мешканець зареєструється, заявка з’явиться тут."
          />
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
                    {formatDateUk(user.createdAt)}
                  </div>
                </div>
                {canApprove && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleApprove(user.id)}
                      disabled={busyId === user.id}
                    >
                      {busyId === user.id ? '…' : 'Підтвердити'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleReject(user.id)}
                      disabled={busyId === user.id}
                    >
                      Відхилити
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

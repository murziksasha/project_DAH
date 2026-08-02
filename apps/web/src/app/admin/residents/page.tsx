'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
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
  const { t } = useI18n();
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
      setError(err instanceof Error ? err.message : t('residentsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setMessage(t('residentsApproved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    const token = getToken();
    if (!token) return;
    const ok = window.confirm(t('residentsRejectConfirm'));
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
      setMessage(t('residentsRejected'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main>
      <PageHeader
        title={t('residentsTitle')}
        description={t('residentsEmptyDesc')}
        actions={
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => load()} disabled={loading}>
            {loading ? t('loading') : t('refresh')}
          </button>
        }
      />

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <section className="card">
        {loading && users.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
        ) : users.length === 0 ? (
          <EmptyState title={t('residentsEmpty')} description={t('residentsEmptyDesc')} />
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
                      ? `${t('entrance')} ${user.apartment.entrance}, ${t('aptPrefix')} ${user.apartment.number}`
                      : t('residentsNoApt')}
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
                      {busyId === user.id ? '…' : t('residentsApprove')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleReject(user.id)}
                      disabled={busyId === user.id}
                    >
                      {t('residentsReject')}
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

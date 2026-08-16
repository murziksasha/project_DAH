'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk } from '@/lib/money';

interface QueueItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  category: string;
}

export function CrewDashboard() {
  const { t } = useI18n();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ items: QueueItem[] }>(
        '/communications/requests/queue?mineOnly=1',
        { token },
      );
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDone(id: string) {
    const token = getToken();
    if (!token) return;
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/communications/requests/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: 'done' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusyId(null);
    }
  }

  async function markProgress(id: string) {
    const token = getToken();
    if (!token) return;
    setBusyId(id);
    try {
      await apiFetch(`/communications/requests/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: 'in_progress' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusyId(null);
    }
  }

  const open = items.filter((i) => i.status !== 'done');

  return (
    <main className="crew-mobile">
      <PageHeader title={t('dashCrewTitle')} description={t('dashCrewDesc')} />
      {error && <p className="error">{error}</p>}
      <div className="quick-actions">
        <Link href="/admin/dispatch?filter=mine" className="quick-action">
          {t('dashOpenMyJobs')}
        </Link>
      </div>
      <section className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
          {t('dispatchOpen')}: {open.length}
        </h2>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
        ) : open.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('dispatchEmpty')}</p>
        ) : (
          <ul className="crew-job-list">
            {open.slice(0, 12).map((i) => (
              <li key={i.id} className="crew-job-card">
                <strong style={{ fontSize: '1.05rem' }}>{i.title}</strong>
                <div style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0.35rem 0' }}>
                  {i.priority} · {i.category}
                  {i.dueAt ? ` · ${formatDateUk(i.dueAt)}` : ''}
                </div>
                <div className="crew-job-actions">
                  {i.status === 'new' && (
                    <button
                      type="button"
                      className="btn crew-btn"
                      disabled={busyId === i.id}
                      onClick={() => void markProgress(i.id)}
                    >
                      {t('commsStatusProgress')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn crew-btn crew-btn-done"
                    disabled={busyId === i.id}
                    onClick={() => void markDone(i.id)}
                  >
                    {t('commsStatusDone')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

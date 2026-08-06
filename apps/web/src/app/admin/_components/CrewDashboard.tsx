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

  const open = items.filter((i) => i.status !== 'done');

  return (
    <main>
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
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {open.slice(0, 8).map((i) => (
              <li key={i.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <strong>{i.title}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {i.priority} · {i.category}
                  {i.dueAt ? ` · ${formatDateUk(i.dueAt)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

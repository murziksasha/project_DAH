'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { formatDateUk } from '@/lib/money';

type SlaStatus = 'ok' | 'warning' | 'breached' | 'none';

interface QueueItem {
  id: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  dueAt: string | null;
  slaStatus: SlaStatus;
  isOverdue: boolean;
  assignee: { id?: string; firstName: string; lastName: string } | null;
}

interface QueueResponse {
  items: QueueItem[];
  summary: {
    open: number;
    overdue: number;
    warning: number;
    unassigned: number;
    urgent: number;
  };
}

export function DispatcherDashboard() {
  const { t } = useI18n();
  const me = getStoredUser();
  const [data, setData] = useState<QueueResponse | null>(null);
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
    setError('');
    try {
      const res = await apiFetch<QueueResponse>('/communications/requests/queue', { token });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function take(id: string) {
    const token = getToken();
    if (!token || !me?.id) return;
    setBusyId(id);
    try {
      await apiFetch(`/communications/requests/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ assigneeId: me.id, status: 'in_progress' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusyId(null);
    }
  }

  const summary = data?.summary;
  const urgent = (data?.items ?? [])
    .filter((i) => i.priority === 'urgent' || i.priority === 'high' || i.isOverdue)
    .slice(0, 5);

  return (
    <main>
      <PageHeader title={t('dashDispatcherTitle')} description={t('dashDispatcherDesc')} />

      <div className="quick-actions">
        <Link href="/admin/dispatch" className="quick-action">
          {t('dispatchFilterAll')}
        </Link>
        <Link href="/admin/dispatch?filter=overdue" className="quick-action">
          {t('dispatchFilterOverdue')}
        </Link>
        <Link href="/admin/dispatch?filter=unassigned" className="quick-action">
          {t('dispatchFilterUnassigned')}
        </Link>
        <Link href="/admin/communications" className="quick-action">
          {t('commsAnnouncements')}
        </Link>
        <Link href="/admin/messenger" className="quick-action">
          Месенджер
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <SkeletonCards count={4} />}

      {!loading && summary && (
        <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
          <Link href="/admin/dispatch" style={{ textDecoration: 'none', color: 'inherit' }}>
            <StatCard label={t('dispatchOpen')} value={String(summary.open)} />
          </Link>
          <Link href="/admin/dispatch?filter=overdue" style={{ textDecoration: 'none', color: 'inherit' }}>
            <StatCard
              label={t('dispatchOverdue')}
              value={String(summary.overdue)}
              tone={summary.overdue > 0 ? 'danger' : 'success'}
            />
          </Link>
          <Link href="/admin/dispatch" style={{ textDecoration: 'none', color: 'inherit' }}>
            <StatCard
              label={t('dispatchWarning')}
              value={String(summary.warning)}
              tone={summary.warning > 0 ? 'danger' : 'success'}
            />
          </Link>
          <Link href="/admin/dispatch?filter=unassigned" style={{ textDecoration: 'none', color: 'inherit' }}>
            <StatCard
              label={t('dispatchUnassigned')}
              value={String(summary.unassigned)}
              tone={summary.unassigned > 0 ? 'danger' : 'success'}
            />
          </Link>
        </div>
      )}

      <section className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t('dashUrgentRequests')}</h2>
          <Link href="/admin/dispatch" className="btn btn-sm btn-ghost">
            {t('dispatchTitle')}
          </Link>
        </div>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
        ) : urgent.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('dispatchEmpty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {urgent.map((item) => (
              <li
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {item.priority} · {item.category}
                    {item.dueAt ? ` · ${formatDateUk(item.dueAt)}` : ''}
                    {item.isOverdue ? ` · ${t('dispatchSlaBreached')}` : ''}
                  </div>
                </div>
                {item.status !== 'done' && (!item.assignee || item.assignee.id !== me?.id) && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busyId === item.id}
                    onClick={() => void take(item.id)}
                  >
                    {t('dispatchTake')}
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

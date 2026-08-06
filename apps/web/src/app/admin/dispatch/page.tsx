'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { formatDateUk } from '@/lib/money';

type SlaStatus = 'ok' | 'warning' | 'breached' | 'none';

interface QueueItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  dueAt: string | null;
  createdAt: string;
  slaStatus: SlaStatus;
  isOverdue: boolean;
  author: { firstName: string; lastName: string; email?: string };
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

type FilterMode = 'all' | 'overdue' | 'unassigned' | 'mine';

const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'] as const;

export default function DispatchPage() {
  const { t } = useI18n();
  const me = getStoredUser();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const f = new URLSearchParams(window.location.search).get('filter');
    if (f === 'overdue' || f === 'unassigned' || f === 'mine' || f === 'all') {
      setFilter(f);
    }
  }, []);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const qs = new URLSearchParams();
    if (filter === 'overdue') qs.set('overdueOnly', '1');
    if (filter === 'unassigned') qs.set('unassignedOnly', '1');
    if (filter === 'mine') qs.set('mineOnly', '1');
    const q = qs.toString();
    const res = await apiFetch<QueueResponse>(
      `/communications/requests/queue${q ? `?${q}` : ''}`,
      { token },
    );
    setData(res);
  }, [filter]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  async function patchRequest(
    id: string,
    body: Record<string, unknown>,
  ) {
    const token = getToken();
    if (!token) return;
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/communications/requests/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(body),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function priorityLabel(p: string) {
    switch (p) {
      case 'urgent':
        return t('dispatchPriorityUrgent');
      case 'high':
        return t('dispatchPriorityHigh');
      case 'low':
        return t('dispatchPriorityLow');
      default:
        return t('dispatchPriorityNormal');
    }
  }

  function slaLabel(s: SlaStatus) {
    if (s === 'breached') return t('dispatchSlaBreached');
    if (s === 'warning') return t('dispatchSlaWarning');
    if (s === 'ok') return t('dispatchSlaOk');
    return '—';
  }

  function slaColor(s: SlaStatus) {
    if (s === 'breached') return 'var(--danger, #c0392b)';
    if (s === 'warning') return '#b8860b';
    if (s === 'ok') return 'var(--success)';
    return 'var(--muted)';
  }

  const summary = data?.summary;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <PageHeader title={t('dispatchTitle')} description={t('dispatchSubtitle')} />

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {summary && (
        <div
          className="grid-2"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {[
            { label: t('dispatchOpen'), value: summary.open },
            { label: t('dispatchOverdue'), value: summary.overdue },
            { label: t('dispatchWarning'), value: summary.warning },
            { label: t('dispatchUnassigned'), value: summary.unassigned },
            { label: t('dispatchUrgent'), value: summary.urgent },
          ].map((s) => (
            <div key={s.label} className="card" style={{ boxShadow: 'none' }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {(
          [
            ['all', t('dispatchFilterAll')],
            ['overdue', t('dispatchFilterOverdue')],
            ['unassigned', t('dispatchFilterUnassigned')],
            ['mine', t('dispatchFilterMine')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab-btn${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!data?.items.length ? (
        <div className="card" style={{ color: 'var(--muted)' }}>
          {t('dispatchEmpty')}
        </div>
      ) : (
        <>
        {/* Mobile-friendly cards */}
        <div className="dispatch-cards" style={{ display: 'none', gap: '0.75rem' }}>
          {[...data.items]
            .sort(
              (a, b) =>
                PRIORITY_ORDER.indexOf(a.priority as (typeof PRIORITY_ORDER)[number]) -
                PRIORITY_ORDER.indexOf(b.priority as (typeof PRIORITY_ORDER)[number]),
            )
            .map((item) => (
              <div key={item.id} className="card dispatch-card" style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{item.title}</strong>
                  <span style={{ color: slaColor(item.slaStatus), fontWeight: 700 }}>
                    {slaLabel(item.slaStatus)}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {priorityLabel(item.priority)} · {item.category} ·{' '}
                  {item.dueAt ? formatDateUk(item.dueAt) : '—'}
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  {item.author.lastName} {item.author.firstName}
                  {item.assignee
                    ? ` → ${item.assignee.lastName} ${item.assignee.firstName}`
                    : ' · без виконавця'}
                </div>
                {item.status !== 'done' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(!item.assignee || item.assignee.id !== me?.id) && (
                      <button
                        type="button"
                        className="btn"
                        style={{ flex: 1, minHeight: 44 }}
                        disabled={busyId === item.id}
                        onClick={() =>
                          patchRequest(item.id, {
                            assigneeId: me?.id,
                            status: 'in_progress',
                          })
                        }
                      >
                        {t('dispatchTake')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ flex: 1, minHeight: 44 }}
                      disabled={busyId === item.id}
                      onClick={() => patchRequest(item.id, { status: 'done' })}
                    >
                      {t('dispatchDone')}
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
        <div className="table-scroll dispatch-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('dispatchPriority')}</th>
                <th>SLA</th>
                <th>{t('dispatchDue')}</th>
                <th>Заявка</th>
                <th>Автор</th>
                <th>Виконавець</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...data.items]
                .sort(
                  (a, b) =>
                    PRIORITY_ORDER.indexOf(a.priority as (typeof PRIORITY_ORDER)[number]) -
                    PRIORITY_ORDER.indexOf(b.priority as (typeof PRIORITY_ORDER)[number]),
                )
                .map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span
                        style={{
                          fontWeight: item.priority === 'urgent' || item.priority === 'high' ? 700 : 500,
                        }}
                      >
                        {priorityLabel(item.priority)}
                      </span>
                    </td>
                    <td style={{ color: slaColor(item.slaStatus), fontWeight: 600 }}>
                      {slaLabel(item.slaStatus)}
                    </td>
                    <td>{item.dueAt ? formatDateUk(item.dueAt) : '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {item.category} · {item.status}
                      </div>
                    </td>
                    <td>
                      {item.author.lastName} {item.author.firstName}
                    </td>
                    <td>
                      {item.assignee
                        ? `${item.assignee.lastName} ${item.assignee.firstName}`
                        : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {item.status !== 'done' && (
                        <>
                          {(!item.assignee || item.assignee.id !== me?.id) && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busyId === item.id}
                              onClick={() =>
                                patchRequest(item.id, {
                                  assigneeId: me?.id,
                                  status: 'in_progress',
                                })
                              }
                            >
                              {t('dispatchTake')}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => patchRequest(item.id, { status: 'done' })}
                          >
                            {t('dispatchDone')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

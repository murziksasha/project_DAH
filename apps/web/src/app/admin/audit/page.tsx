'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk } from '@/lib/money';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

interface AuditResponse {
  items: AuditLog[];
  nextCursor: string | null;
}

const PRESET_ACTIONS = [
  '',
  'payment',
  'expense',
  'accrual',
  'auth',
  'announcement',
  'request',
];

export default function AuditPage() {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ACTION_LABELS: Record<string, string> = {
    'auth.login': t('login'),
    'auth.logout': t('logout'),
    'auth.approve': t('residentsApprove'),
    'auth.reject': t('residentsReject'),
    'auth.2fa_enabled': t('securityEnabled'),
    'auth.2fa_disabled': t('securityDisabled'),
    'expense.created': t('expenseSaved'),
    'expense.voided': t('expenseSaved'),
    'accrual.created': t('accrualsTitle'),
    'payment.created': t('paymentsTitle'),
    'payment.voided': t('paymentsTitle'),
    'payment.import': t('import'),
    'announcement.created': t('commsAnnouncements'),
    'announcement.deleted': t('commsAnnDeleted'),
    'request.created': t('commsRequests'),
    'request.updated': t('commsRequests'),
    'poll.created': t('commsPolls'),
    'poll.closed': t('commsPolls'),
    'document.created': t('documents'),
    'document.deleted': t('documents'),
    'building.settings_updated': t('settings'),
  };

  const load = useCallback(
    async (nextCursor?: string | null, append = false) => {
      const token = getToken();
      if (!token) {
        window.location.href = '/login';
        return;
      }
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (nextCursor) params.set('cursor', nextCursor);
        if (filter) params.set('action', filter);
        if (entityType) params.set('entityType', entityType);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const data = await apiFetch<AuditResponse>(`/audit/logs?${params}`, { token });
        setLogs(append ? (prev) => [...prev, ...data.items] : data.items);
        setCursor(data.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('error'));
      } finally {
        setLoading(false);
      }
    },
    [filter, entityType, from, to, t],
  );

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const timeLocale = locale === 'ru' ? 'ru-RU' : 'uk-UA';

  return (
    <main>
      <PageHeader
        title={t('auditPageTitle')}
        description={t('auditPageDesc')}
        actions={
          <button type="button" className="btn btn-sm btn-ghost no-print" onClick={() => window.print()}>
            {t('auditPrint')}
          </button>
        }
      />

      <div
        className="card no-print"
        style={{
          marginBottom: '1rem',
          display: 'grid',
          gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          alignItems: 'end',
        }}
      >
        <div>
          <label htmlFor="act">{t('auditAction')}</label>
          <select id="act" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('all')}</option>
            {PRESET_ACTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ent">{t('auditEntity')}</label>
          <input
            id="ent"
            placeholder="Payment, Expense…"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="af">{t('from')}</label>
          <input id="af" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="at">{t('to')}</label>
          <input id="at" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" onClick={() => load()} disabled={loading}>
          {loading ? '…' : t('refresh')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        {logs.length === 0 ? (
          <EmptyState title={t('auditEmptyTitle')} description={t('auditEmptyDesc')} />
        ) : (
          <ul className="audit-log-list">
            {logs.map((log) => (
              <li key={log.id} className="audit-log-item">
                <div className="audit-log-head">
                  <div className="audit-log-main">
                    <div className="audit-log-action">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </div>
                    <div className="audit-log-meta">
                      {log.entityType} · {log.entityId.slice(-8)}
                      {log.user
                        ? ` · ${log.user.firstName} ${log.user.lastName} (${log.user.email})`
                        : ''}
                    </div>
                  </div>
                  <time className="audit-log-time">
                    {formatDateUk(log.createdAt)}{' '}
                    {new Date(log.createdAt).toLocaleTimeString(timeLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                {log.payload && Object.keys(log.payload).length > 0 && (
                  <pre className="audit-log-payload">{JSON.stringify(log.payload, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button
            type="button"
            className="btn btn-ghost btn-sm no-print"
            style={{ marginTop: '1rem' }}
            disabled={loading}
            onClick={() => load(cursor, true)}
          >
            {t('auditMore')}
          </button>
        )}
      </section>
    </main>
  );
}

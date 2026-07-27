'use client';

import { useCallback, useEffect, useState } from 'react';
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

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Вхід',
  'auth.logout': 'Вихід',
  'auth.approve': 'Підтвердження мешканця',
  'auth.reject': 'Відхилення мешканця',
  'auth.2fa_enabled': '2FA увімкнено',
  'auth.2fa_disabled': '2FA вимкнено',
  'expense.created': 'Витрата створена',
  'expense.voided': 'Витрата анульована',
  'accrual.created': 'Нарахування',
  'payment.created': 'Платіж',
  'payment.voided': 'Платіж анульовано',
  'payment.import': 'Імпорт платежів',
  'announcement.created': 'Оголошення',
  'announcement.deleted': 'Оголошення видалено',
  'request.created': 'Заявка',
  'request.updated': 'Заявка оновлена',
  'poll.created': 'Опитування',
  'poll.closed': 'Опитування закрито',
  'document.created': 'Документ',
  'document.deleted': 'Документ видалено',
  'building.settings_updated': 'Налаштування',
};

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
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        setError(err instanceof Error ? err.message : 'Помилка');
      } finally {
        setLoading(false);
      }
    },
    [filter, entityType, from, to],
  );

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <main>
      <PageHeader
        title="Журнал аудиту"
        description="Фінансові та адміністративні дії"
        actions={
          <button type="button" className="btn btn-sm btn-ghost no-print" onClick={() => window.print()}>
            Друк
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
          <label htmlFor="act">Дія</label>
          <select id="act" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Усі</option>
            {PRESET_ACTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ent">Сутність</label>
          <input
            id="ent"
            placeholder="Payment, Expense…"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="af">Від</label>
          <input id="af" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="at">До</label>
          <input id="at" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" onClick={() => load()} disabled={loading}>
          {loading ? '…' : 'Оновити'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        {logs.length === 0 ? (
          <EmptyState title="Записів немає" description="Змініть фільтр або виконайте дію в системі." />
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
                    {new Date(log.createdAt).toLocaleTimeString('uk-UA', {
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
            Ще
          </button>
        )}
      </section>
    </main>
  );
}

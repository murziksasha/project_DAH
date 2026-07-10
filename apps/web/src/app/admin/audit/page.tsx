'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

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
  'expense.created': 'Витрата створена',
  'expense.voided': 'Витрата анульована',
  'accrual.created': 'Нарахування',
  'payment.created': 'Платіж',
  'payment.voided': 'Платіж анульовано',
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

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(nextCursor?: string | null, append = false) {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (nextCursor) params.set('cursor', nextCursor);
      if (filter) params.set('action', filter);
      const data = await apiFetch<AuditResponse>(`/audit/logs?${params}`, { token });
      setLogs(append ? (prev) => [...prev, ...data.items] : data.items);
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [filter]);

  return (
    <main>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Журнал аудиту</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Усі фінансові та адміністративні дії в системі
      </p>

      <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          placeholder="Фільтр за дією (напр. payment)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="button" onClick={() => load()} disabled={loading}>
          Оновити
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        {logs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Записів немає</p>
        ) : (
          <ul className="audit-log-list">
            {logs.map((log) => (
              <li key={log.id} className="audit-log-item">
                <div className="audit-log-head">
                  <div className="audit-log-main">
                    <div className="audit-log-action">{ACTION_LABELS[log.action] ?? log.action}</div>
                    <div className="audit-log-meta">
                      {log.user ? `${log.user.firstName} ${log.user.lastName}` : '—'}
                      {' · '}
                      {log.entityType} · {log.entityId.slice(-8)}
                    </div>
                  </div>
                  <time className="audit-log-time" dateTime={log.createdAt}>
                    {new Date(log.createdAt).toLocaleString('uk-UA')}
                  </time>
                </div>
                {log.payload && (
                  <pre className="audit-log-payload">{JSON.stringify(log.payload, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <button
            type="button"
            onClick={() => load(cursor, true)}
            disabled={loading}
            style={{ marginTop: '1rem', width: '100%' }}
          >
            {loading ? 'Завантаження…' : 'Ще записи'}
          </button>
        )}
      </section>
    </main>
  );
}
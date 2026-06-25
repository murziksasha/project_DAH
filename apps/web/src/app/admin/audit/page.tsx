'use client';

import Link from 'next/link';
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
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
      <Link href="/admin" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Дашборд</Link>
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
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Час</th>
                <th style={{ padding: '0.5rem' }}>Дія</th>
                <th style={{ padding: '0.5rem' }}>Користувач</th>
                <th style={{ padding: '0.5rem' }}>Сутність</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                    {new Date(log.createdAt).toLocaleString('uk-UA')}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ fontWeight: 600 }}>{ACTION_LABELS[log.action] ?? log.action}</div>
                    {log.payload && (
                      <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                        {JSON.stringify(log.payload)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : '—'}
                  </td>
                  <td style={{ padding: '0.5rem', color: 'var(--muted)' }}>
                    {log.entityType} · {log.entityId.slice(-8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
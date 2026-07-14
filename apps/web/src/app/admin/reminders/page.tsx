'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk } from '@/lib/money';

interface Reminder {
  id: string;
  type: string;
  title: string;
  body: string | null;
  dueAt: string;
  sentAt: string | null;
  user?: { email: string; firstName: string; lastName: string } | null;
  apartment?: { number: string; entrance: number } | null;
}

export default function RemindersPage() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<Reminder[]>('/reminders?includeSent=1', { token });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');
    try {
      await apiFetch('/reminders', {
        method: 'POST',
        token,
        body: JSON.stringify({
          type: 'custom',
          title,
          body: body || undefined,
          dueAt: new Date(dueAt).toISOString(),
        }),
      });
      setTitle('');
      setBody('');
      setMessage('Нагадування створено');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function processNow() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await apiFetch<{ customSent: number; debtSent: number }>('/reminders/process', {
        method: 'POST',
        token,
      });
      setMessage(`Оброблено: custom=${res.customSent}, debt emails=${res.debtSent}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function remove(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/reminders/${id}`, { method: 'DELETE', token });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main>
      <PageHeader
        title="Нагадування"
        description="Кастомні нагадування та email про борг (worker кожні 15 хв)"
        actions={
          <button type="button" className="btn btn-sm btn-ghost" onClick={processNow}>
            Запустити зараз
          </button>
        }
      />

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form onSubmit={create} className="card" style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.05rem' }}>Нове нагадування</h2>
        <div>
          <label htmlFor="t">Заголовок</label>
          <input id="t" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="b">Текст</label>
          <textarea id="b" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div>
          <label htmlFor="d">Дата/час</label>
          <input
            id="d"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            required
          />
        </div>
        <button type="submit">Створити</button>
      </form>

      <section className="card">
        <h2 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Список</h2>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
        ) : items.length === 0 ? (
          <EmptyState title="Немає нагадувань" />
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
            {items.map((r) => (
              <li
                key={r.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {r.title}{' '}
                    <span className={`badge badge-${r.sentAt ? 'muted' : 'warning'}`}>
                      {r.sentAt ? 'Надіслано' : 'Очікує'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {formatDateUk(r.dueAt)} · {r.type}
                    {r.apartment ? ` · кв. ${r.apartment.number}` : ''}
                  </div>
                  {r.body && <p style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>{r.body}</p>}
                </div>
                {!r.sentAt && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(r.id)}>
                    Видалити
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

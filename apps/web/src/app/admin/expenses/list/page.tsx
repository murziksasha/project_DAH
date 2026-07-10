'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Fund { id: string; name: string }

interface Expense {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  documentUrl: string | null;
  fund: { id: string; name: string };
  category: { name: string };
  supplier: { name: string } | null;
}

export default function ExpensesListPage() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fundId, setFundId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadExpenses() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (fundId) params.set('fundId', fundId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      const data = await apiFetch<Expense[]>(`/finance/expenses${qs ? `?${qs}` : ''}`, { token });
      setExpenses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    apiFetch<Fund[]>('/finance/funds', { token })
      .then(setFunds)
      .then(() => loadExpenses());
  }, []);

  return (
    <main>
      <Link href="/admin/expenses" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Нова витрата</Link>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Витрати ОСМД</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>Фільтрація по фонду та періоду</p>

      <div className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div>
          <label>Фонд</label>
          <select value={fundId} onChange={(e) => setFundId(e.target.value)}>
            <option value="">Усі фонди</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Від</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label>До</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button type="button" onClick={loadExpenses} style={{ width: '100%' }}>Застосувати</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Завантаження...</p>
        ) : expenses.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Витрат не знайдено</p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
            {expenses.map((e) => (
              <li key={e.id} style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.description ?? e.category.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {e.fund.name}
                      {e.supplier ? ` · ${e.supplier.name}` : ''}
                      {' · '}
                      {new Date(e.date).toLocaleDateString('uk-UA')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--danger)' }}>
                      −{Number(e.amount).toLocaleString('uk-UA')} ₴
                    </div>
                    {e.documentUrl && (
                      <a href={e.documentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85rem' }}>
                        Платіжка
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
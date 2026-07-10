'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface AccrualLine {
  id: string;
  amount: string;
  paidAmount: string;
  status: string;
  apartment: { number: string };
}

interface Accrual {
  id: string;
  period: string;
  title: string;
  createdAt: string;
  fund: { name: string };
  lines: AccrualLine[];
}

export default function AccrualsListPage() {
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [period, setPeriod] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const qs = period ? `?period=${period}` : '';
    const data = await apiFetch<Accrual[]>(`/accruals${qs}`, { token });
    setAccruals(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <Link href="/admin/accruals" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Нарахування</Link>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Історія нарахувань</h1>

      <div className="card" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>Період</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <button type="button" onClick={load}>Фільтр</button>
      </div>

      {error && <p className="error">{error}</p>}

      {accruals.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Нарахувань ще немає</p>
      ) : (
        accruals.map((a) => {
          const total = a.lines.reduce((s, l) => s + Number(l.amount), 0);
          return (
            <section key={a.id} className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem' }}>{a.title}</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {a.period} · {a.fund.name} · {a.lines.length} кв. · {total.toLocaleString('uk-UA')} ₴
                  </p>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {new Date(a.createdAt).toLocaleDateString('uk-UA')}
                </span>
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
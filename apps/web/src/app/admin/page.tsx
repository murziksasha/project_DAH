'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface CashFlowReport {
  totalIncome: number;
  totalExpenses: number;
  netFlow: number;
  fundBalances: Array<{
    fundName: string;
    balance: number;
    income: number;
    expenses: number;
  }>;
}

interface Expense {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  fund: { name: string };
  category: { name: string };
}

export default function AdminDashboard() {
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }

    Promise.all([
      apiFetch<CashFlowReport>('/finance/reports/cash-flow', { token }),
      apiFetch<Expense[]>('/finance/expenses', { token }),
    ])
      .then(([r, e]) => {
        setReport(r);
        setExpenses(e.slice(0, 5));
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Кабінет правління</h1>
        <p style={{ color: 'var(--muted)' }}>Фінансовий стан ОСМД</p>
      </header>

      {error && <p className="error">{error}</p>}

      {report && (
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <div className="stat-label">Надходження</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {report.totalIncome.toLocaleString('uk-UA')} ₴
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Витрати</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>
              {report.totalExpenses.toLocaleString('uk-UA')} ₴
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Чистий рух</div>
            <div className="stat-value">{report.netFlow.toLocaleString('uk-UA')} ₴</div>
          </div>
        </div>
      )}

      {report?.fundBalances && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Баланс фондів</h2>
          <div className="grid-2">
            {report.fundBalances.map((f) => (
              <div key={f.fundName} style={{ padding: '0.75rem', background: 'var(--surface-2)', borderRadius: '8px' }}>
                <div style={{ fontWeight: 600 }}>{f.fundName}</div>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                  {f.balance.toLocaleString('uk-UA')} ₴
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginBottom: '1rem' }}>Останні витрати</h2>
        {expenses.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Немає витрат</p>
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
            {expenses.map((e) => (
              <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{e.description ?? e.category.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {e.fund.name} · {new Date(e.date).toLocaleDateString('uk-UA')}
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--danger)' }}>
                  −{Number(e.amount).toLocaleString('uk-UA')} ₴
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
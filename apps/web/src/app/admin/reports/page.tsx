'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Debtor {
  apartmentId: string;
  number: string;
  entrance: number;
  debt: number;
  lines: number;
  oldestDue: string | null;
  isOverdue: boolean;
}

interface CashFlowReport {
  totalIncome: number;
  totalExpenses: number;
  netFlow: number;
  fundBalances: Array<{ fundName: string; balance: number; income: number; expenses: number }>;
}

export default function ReportsPage() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    Promise.all([
      apiFetch<Debtor[]>('/payments/reports/debtors', { token }),
      apiFetch<CashFlowReport>('/finance/reports/cash-flow', { token }),
    ])
      .then(([d, c]) => {
        setDebtors(d);
        setCashFlow(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  const totalDebt = debtors.reduce((s, d) => s + d.debt, 0);

  return (
    <main>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Звіти</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>Рух коштів та реєстр боржників</p>

      {error && <p className="error">{error}</p>}

      {cashFlow && (
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <div className="stat-label">Надходження</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {cashFlow.totalIncome.toLocaleString('uk-UA')} ₴
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Витрати</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>
              {cashFlow.totalExpenses.toLocaleString('uk-UA')} ₴
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Чистий рух</div>
            <div className="stat-value">{cashFlow.netFlow.toLocaleString('uk-UA')} ₴</div>
          </div>
          <div className="card">
            <div className="stat-label">Загальна дебіторка</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>
              {totalDebt.toLocaleString('uk-UA')} ₴
            </div>
          </div>
        </div>
      )}

      <section className="card">
        <h2 style={{ marginBottom: '1rem' }}>Реєстр боржників ({debtors.length})</h2>
        {debtors.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Боржників немає</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Кв.</th>
                <th style={{ padding: '0.5rem' }}>Під&apos;їзд</th>
                <th style={{ padding: '0.5rem' }}>Борг ₴</th>
                <th style={{ padding: '0.5rem' }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map((d) => (
                <tr key={d.apartmentId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem' }}>{d.number}</td>
                  <td style={{ padding: '0.5rem' }}>{d.entrance}</td>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>{d.debt.toLocaleString('uk-UA')}</td>
                  <td style={{ padding: '0.5rem', color: d.isOverdue ? 'var(--danger)' : 'var(--muted)' }}>
                    {d.isOverdue ? 'Прострочено' : 'До сплати'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
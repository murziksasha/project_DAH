'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { formatDateUk, formatMoney } from '@/lib/money';
import { getQuickActions } from '@/lib/nav-config';

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

interface ExpensesPage {
  items: Expense[];
  total: number;
}

interface Debtor {
  apartmentId: string;
  number: string;
  debt: number;
  isOverdue: boolean;
}

interface OpsSummary {
  pendingResidents: number;
  openRequests: number;
  activePolls: number;
  openAccrualLines: number;
  documents: number;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminDashboard() {
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [ops, setOps] = useState<OpsSummary | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();
  const quickActions = getQuickActions(user?.role ?? '');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const q = qs.toString();
      const expQs = new URLSearchParams();
      if (from) expQs.set('from', from);
      if (to) expQs.set('to', to);
      const eq = expQs.toString();

      const [r, e, d, o] = await Promise.all([
        apiFetch<CashFlowReport>(`/finance/reports/cash-flow${q ? `?${q}` : ''}`, { token }),
        apiFetch<ExpensesPage>(
          `/finance/expenses?${eq ? `${eq}&` : ''}page=1&limit=5`,
          { token },
        ),
        apiFetch<Debtor[]>('/payments/reports/debtors', { token }).catch(() => [] as Debtor[]),
        apiFetch<OpsSummary>('/building/ops-summary', { token }).catch(() => null),
      ]);
      setReport(r);
      setExpenses(e.items ?? []);
      setDebtors(d.slice(0, 5));
      setOps(o);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const totalDebt = debtors.reduce((s, d) => s + d.debt, 0);
  const collectionRate =
    report && report.totalIncome + totalDebt > 0
      ? Math.round((report.totalIncome / (report.totalIncome + totalDebt)) * 100)
      : null;

  return (
    <main>
      <PageHeader title="Кабінет правління" description="Фінансовий стан ОСМД за період" />

      {quickActions.length > 0 && (
        <div className="quick-actions">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="quick-action">
              {a.label}
            </Link>
          ))}
        </div>
      )}

      <div
        className="card no-print"
        style={{
          display: 'grid',
          gap: '0.75rem',
          marginBottom: '1.25rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          alignItems: 'end',
        }}
      >
        <div>
          <label htmlFor="from">Від</label>
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="to">До</label>
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" onClick={() => load()}>
          Оновити
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <SkeletonCards count={4} />}

      {!loading && ops && (
        <div className="grid-2 no-print" style={{ marginBottom: '1.25rem' }}>
          {ops.pendingResidents > 0 && (
            <Link href="/admin/residents" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="stat-label">Заявки на реєстрацію</div>
              <div className="stat-value tone-warning" style={{ color: 'var(--warning)' }}>
                {ops.pendingResidents}
              </div>
            </Link>
          )}
          {ops.openRequests > 0 && (
            <Link
              href="/admin/communications"
              className="card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="stat-label">Відкриті заявки мешканців</div>
              <div className="stat-value">{ops.openRequests}</div>
            </Link>
          )}
          {ops.openAccrualLines > 0 && (
            <Link href="/admin/reports" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="stat-label">Відкриті рядки нарахувань</div>
              <div className="stat-value">{ops.openAccrualLines}</div>
            </Link>
          )}
        </div>
      )}

      {!loading && report && (
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <StatCard label="Надходження" value={formatMoney(report.totalIncome)} tone="success" />
          <StatCard label="Витрати" value={formatMoney(report.totalExpenses)} tone="danger" />
          <StatCard
            label="Чистий рух"
            value={formatMoney(report.netFlow, { signed: true })}
            tone={report.netFlow >= 0 ? 'success' : 'danger'}
          />
          <StatCard
            label="Дебіторська заборгованість"
            value={formatMoney(totalDebt)}
            tone={totalDebt > 0 ? 'danger' : 'success'}
            hint={
              collectionRate !== null ? `Орієнтовна зібраність: ${collectionRate}%` : undefined
            }
          />
        </div>
      )}

      {!loading && report?.fundBalances && report.fundBalances.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Баланс фондів</h2>
          <div className="grid-2">
            {report.fundBalances.map((f) => (
              <div
                key={f.fundName}
                style={{
                  padding: '0.75rem',
                  background: 'var(--surface-2)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontWeight: 600 }}>{f.fundName}</div>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                  {formatMoney(f.balance)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && debtors.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ fontSize: '1.1rem' }}>Топ боржників</h2>
            <Link href="/admin/reports" className="btn btn-sm btn-ghost">
              Усі звіти
            </Link>
          </div>
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.65rem' }}>
            {debtors.map((d) => (
              <li
                key={d.apartmentId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  paddingBottom: '0.65rem',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <Link href={`/admin/apartments/${d.apartmentId}`}>
                  Кв. {d.number}
                  {d.isOverdue && (
                    <span className="badge badge-danger" style={{ marginLeft: '0.5rem' }}>
                      Прострочено
                    </span>
                  )}
                </Link>
                <strong style={{ color: 'var(--danger)' }}>{formatMoney(d.debt)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ fontSize: '1.1rem' }}>Останні витрати</h2>
          <Link href="/admin/expenses/list" className="btn btn-sm btn-ghost">
            Усі витрати
          </Link>
        </div>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
        ) : expenses.length === 0 ? (
          <EmptyState
            title="Ще немає витрат"
            description="Додайте першу витрату з чеком або рахунком постачальника."
            actionHref="/admin/expenses"
            actionLabel="Нова витрата"
          />
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
            {expenses.map((e) => (
              <li
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{e.description ?? e.category.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {e.fund.name} · {formatDateUk(e.date)}
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--danger)' }}>−{formatMoney(e.amount)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk, formatMoney } from '@/lib/money';
import { useDebtorsQuery, useOpsSummaryQuery } from '@/lib/queries';

interface CashFlowReport {
  totalIncome: number;
  totalExpenses: number;
  netFlow: number;
}

interface Expense {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  approvalStatus?: string;
  fund: { name: string };
  category: { name: string };
}

interface Debtor {
  apartmentId: string;
  number: string;
  debt: number;
  isOverdue: boolean;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AccountantDashboard() {
  const { t } = useI18n();
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pending, setPending] = useState<Expense[]>([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const debtorsQuery = useDebtorsQuery(Boolean(getToken()));
  const opsQuery = useOpsSummaryQuery(Boolean(getToken()));
  const debtors = (debtorsQuery.data ?? []).slice(0, 5) as Debtor[];
  const ops = opsQuery.data as
    | { pendingResidents?: number; openAccrualLines?: number }
    | undefined;

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
      const expQs = new URLSearchParams(q);
      expQs.set('page', '1');
      expQs.set('limit', '5');

      const [r, e, p] = await Promise.all([
        apiFetch<CashFlowReport>(`/finance/reports/cash-flow${q ? `?${q}` : ''}`, { token }),
        apiFetch<{ items: Expense[] }>(`/finance/expenses?${expQs}`, { token }),
        apiFetch<{ items: Expense[] }>(
          `/finance/expenses?approvalStatus=pending&page=1&limit=5`,
          { token },
        ).catch(() => ({ items: [] as Expense[] })),
      ]);
      setReport(r);
      setExpenses(e.items ?? []);
      setPending(p.items ?? []);
      await Promise.all([debtorsQuery.refetch(), opsQuery.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [from, to, debtorsQuery, opsQuery, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totalDebt = debtors.reduce((s, d) => s + d.debt, 0);

  return (
    <main>
      <PageHeader title={t('dashAccountantTitle')} description={t('dashAccountantDesc')} />

      <div className="quick-actions">
        <Link href="/admin/payments" className="quick-action">
          {t('qaRecordPayment')}
        </Link>
        <Link href="/admin/expenses" className="quick-action">
          {t('qaNewExpense')}
        </Link>
        <Link href="/admin/accruals" className="quick-action">
          {t('qaAccrual')}
        </Link>
        <Link href="/admin/payments" className="quick-action">
          {t('paymentsTabImport')}
        </Link>
        <Link href="/admin/reports" className="quick-action">
          {t('qaDebtors')}
        </Link>
        <Link href="/admin/search" className="quick-action">
          {t('qaAccount')}
        </Link>
      </div>

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
          <label htmlFor="acc-from">{t('from')}</label>
          <input id="acc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="acc-to">{t('to')}</label>
          <input id="acc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" onClick={() => void load()}>
          {t('refresh')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <SkeletonCards count={4} />}

      {!loading && ops && (ops.pendingResidents || ops.openAccrualLines) ? (
        <div className="grid-2 no-print" style={{ marginBottom: '1.25rem' }}>
          {(ops.pendingResidents ?? 0) > 0 && (
            <Link href="/admin/residents" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="stat-label">{t('residents')}</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>
                {ops.pendingResidents}
              </div>
            </Link>
          )}
          {(ops.openAccrualLines ?? 0) > 0 && (
            <Link href="/admin/reports" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="stat-label">{t('dashOpenAccrualLines')}</div>
              <div className="stat-value">{ops.openAccrualLines}</div>
            </Link>
          )}
        </div>
      ) : null}

      {!loading && report && (
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <StatCard label={t('dashIncome')} value={formatMoney(report.totalIncome)} tone="success" />
          <StatCard label={t('dashExpense')} value={formatMoney(report.totalExpenses)} tone="danger" />
          <StatCard
            label={t('dashNet')}
            value={formatMoney(report.netFlow, { signed: true })}
            tone={report.netFlow >= 0 ? 'success' : 'danger'}
          />
          <StatCard
            label={t('dashReceivables')}
            value={formatMoney(totalDebt)}
            tone={totalDebt > 0 ? 'danger' : 'success'}
          />
        </div>
      )}

      {!loading && pending.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t('dashPendingExpenses')}</h2>
            <Link href="/admin/expenses/list?approvalStatus=pending" className="btn btn-sm btn-ghost">
              {t('expenseList')}
            </Link>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {pending.map((e) => (
              <li
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 8,
                }}
              >
                <div>
                  <strong>{e.description ?? e.category.name}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {e.fund.name} · {formatDateUk(e.date)}
                  </div>
                </div>
                <strong style={{ color: 'var(--danger)' }}>−{formatMoney(e.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && debtors.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t('dashTopDebtors')}</h2>
            <Link href="/admin/reports" className="btn btn-sm btn-ghost">
              {t('dashAllReports')}
            </Link>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {debtors.map((d) => (
              <li
                key={d.apartmentId}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <Link href={`/admin/apartments/${d.apartmentId}`}>
                  {t('aptPrefix')} {d.number}
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
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t('dashRecentExpenses')}</h2>
          <Link href="/admin/expenses/list" className="btn btn-sm btn-ghost">
            {t('dashAllExpenses')}
          </Link>
        </div>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
        ) : expenses.length === 0 ? (
          <EmptyState
            title={t('dashNoExpensesTitle')}
            description={t('dashNoExpensesDesc')}
            actionHref="/admin/expenses"
            actionLabel={t('newExpense')}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {expenses.map((e) => (
              <li
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 8,
                }}
              >
                <div>
                  <strong>{e.description ?? e.category.name}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {e.fund.name} · {formatDateUk(e.date)}
                  </div>
                </div>
                <strong style={{ color: 'var(--danger)' }}>−{formatMoney(e.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

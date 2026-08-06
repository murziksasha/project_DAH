'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { formatDateUk, formatMoney } from '@/lib/money';
import { navLabelForHref } from '@/lib/i18n';
import { getQuickActions } from '@/lib/nav-config';
import { labelsForOrg } from '@/lib/org-labels';
import { useDebtorsQuery, useOpsSummaryQuery } from '@/lib/queries';

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

export function BoardDashboard() {
  const { t, locale } = useI18n();
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();
  const quickActions = getQuickActions(user?.role ?? '');
  const debtorsQuery = useDebtorsQuery(Boolean(getToken()));
  const opsQuery = useOpsSummaryQuery(Boolean(getToken()));
  const debtors = (debtorsQuery.data ?? []).slice(0, 5) as Debtor[];
  const ops = (opsQuery.data as OpsSummary | undefined) ?? null;

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

      const [r, e] = await Promise.all([
        apiFetch<CashFlowReport>(`/finance/reports/cash-flow${q ? `?${q}` : ''}`, { token }),
        apiFetch<ExpensesPage>(
          `/finance/expenses?${eq ? `${eq}&` : ''}page=1&limit=5`,
          { token },
        ),
      ]);
      setReport(r);
      setExpenses(e.items ?? []);
      await Promise.all([debtorsQuery.refetch(), opsQuery.refetch()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [from, to, debtorsQuery, opsQuery, t]);

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial + period only
  }, [from, to]);

  const totalDebt = debtors.reduce((s, d) => s + d.debt, 0);
  const collectionRate =
    report && report.totalIncome + totalDebt > 0
      ? Math.round((report.totalIncome / (report.totalIncome + totalDebt)) * 100)
      : null;
  const orgLabels = labelsForOrg(getStoredUser()?.tenant?.orgType);

  return (
    <main>
      <PageHeader
        title={orgLabels.boardCabinet}
        description={t('dashFinancialPeriod', { org: orgLabels.orgNoun })}
      />

      {quickActions.length > 0 && (
        <div className="quick-actions">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="quick-action">
              {a.href === '/admin/payments'
                ? t('qaRecordPayment')
                : a.href === '/admin/expenses'
                  ? t('qaNewExpense')
                  : a.href === '/admin/accruals'
                    ? t('qaAccrual')
                    : a.href === '/admin/search'
                      ? t('qaAccount')
                      : a.href === '/admin/reports'
                        ? t(a.label === 'Боржники' ? 'qaDebtors' : 'qaReports')
                        : navLabelForHref(a.href, a.label, locale)}
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
          <label htmlFor="from">{t('from')}</label>
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="to">{t('to')}</label>
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" onClick={() => load()}>
          {t('refresh')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <SkeletonCards count={4} />}

      {!loading && ops && (
        <div className="grid-2 no-print" style={{ marginBottom: '1.25rem' }}>
          {ops.pendingResidents > 0 && (
            <Link href="/admin/residents" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="stat-label">{t('residents')}</div>
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
              <div className="stat-label">{t('dashOpenRequestsResidents')}</div>
              <div className="stat-value">{ops.openRequests}</div>
            </Link>
          )}
          {ops.openAccrualLines > 0 && (
            <Link href="/admin/reports" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="stat-label">{t('dashOpenAccrualLines')}</div>
              <div className="stat-value">{ops.openAccrualLines}</div>
            </Link>
          )}
        </div>
      )}

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
            hint={
              collectionRate !== null
                ? t('dashCollectionHint', { rate: collectionRate })
                : undefined
            }
          />
        </div>
      )}

      {!loading && report?.fundBalances && report.fundBalances.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('dashFunds')}</h2>
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
            <h2 style={{ fontSize: '1.1rem' }}>{t('dashTopDebtors')}</h2>
            <Link href="/admin/reports" className="btn btn-sm btn-ghost">
              {t('dashAllReports')}
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
                  {t('aptPrefix')} {d.number}
                  {d.isOverdue && (
                    <span className="badge badge-danger" style={{ marginLeft: '0.5rem' }}>
                      {t('overdue')}
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
          <h2 style={{ fontSize: '1.1rem' }}>{t('dashRecentExpenses')}</h2>
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

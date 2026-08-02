'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { downloadXlsx } from '@/lib/xlsx';
import { formatDateUk, formatMoney } from '@/lib/money';
import { useExpensesPageQuery, useFundsQuery } from '@/lib/queries';

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
  const { t } = useI18n();
  const [fundId, setFundId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const fundsQuery = useFundsQuery(Boolean(getToken()));
  const expensesQuery = useExpensesPageQuery(
    { fundId: fundId || undefined, from: from || undefined, to: to || undefined, page, limit: 30 },
    Boolean(getToken()),
  );

  const funds = fundsQuery.data ?? [];
  const expenses = (expensesQuery.data?.items ?? []) as Expense[];
  const total = expensesQuery.data?.total ?? 0;
  const totalPages = expensesQuery.data?.totalPages ?? 1;
  const loading = expensesQuery.isLoading || expensesQuery.isFetching;

  useEffect(() => {
    if (!getToken()) window.location.href = '/login';
  }, []);

  useEffect(() => {
    if (expensesQuery.error) {
      setError(expensesQuery.error instanceof Error ? expensesQuery.error.message : t('error'));
    }
  }, [expensesQuery.error, t]);

  async function voidExpense(id: string) {
    const reason = window.prompt(t('expenseVoidPrompt'));
    if (!reason?.trim()) return;
    const token = getToken();
    if (!token) return;
    setVoidingId(id);
    setError('');
    try {
      await apiFetch(`/finance/expenses/${id}/void`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setMessage(t('expenseVoided'));
      await expensesQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('expenseVoidError'));
    } finally {
      setVoidingId(null);
    }
  }

  async function exportExcel() {
    // Export content stays as-is (not translated UI chrome)
    await downloadXlsx(`vytraty-p${page}-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: 'Витрати',
        rows: [
          ['Дата', 'Опис', 'Категорія', 'Фонд', 'Постачальник', 'Сума'],
          ...expenses.map((e) => [
            formatDateUk(e.date),
            e.description ?? '',
            e.category.name,
            e.fund.name,
            e.supplier?.name ?? '',
            Number(e.amount),
          ]),
        ],
      },
    ]);
  }

  const pageTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <main>
      <Link href="/admin/expenses" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        {t('expenseBackNew')}
      </Link>
      <PageHeader
        title={t('expenseOrgTitle')}
        description={t('expenseListDesc')}
        actions={
          <>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void exportExcel()}
              disabled={!expenses.length}
            >
              {t('expenseExcelPage')}
            </button>
            <Link href="/admin/expenses" className="btn btn-sm">
              {t('expensePlus')}
            </Link>
          </>
        }
      />

      <div
        className="card"
        style={{
          display: 'grid',
          gap: '1rem',
          marginBottom: '1.5rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        }}
      >
        <div>
          <label>{t('expenseFund')}</label>
          <select
            value={fundId}
            onChange={(e) => {
              setPage(1);
              setFundId(e.target.value);
            }}
          >
            <option value="">{t('expenseAllFunds')}</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>{t('from')}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
          />
        </div>
        <div>
          <label>{t('to')}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <button
            type="button"
            onClick={() => void expensesQuery.refetch()}
            style={{ width: '100%' }}
          >
            {t('refresh')}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      {!loading && (
        <p style={{ color: 'var(--muted)', marginBottom: '0.75rem' }}>
          {t('expensePageSummary', {
            total,
            page,
            totalPages,
            sum: formatMoney(pageTotal),
          })}
        </p>
      )}

      <section className="card">
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
        ) : expenses.length === 0 ? (
          <EmptyState
            title={t('expenseNotFound')}
            description={t('expenseNotFoundDesc')}
            actionHref="/admin/expenses"
            actionLabel={t('newExpense')}
          />
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
                      {formatDateUk(e.date)} · {e.category.name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--danger)' }}>−{formatMoney(e.amount)}</div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
                      {e.documentUrl && (
                        <a
                          href={e.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-ghost"
                        >
                          {t('expensePaymentSlip')}
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={voidingId === e.id}
                        onClick={() => voidExpense(e.id)}
                      >
                        {t('voidAction')}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← {t('prev')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next')} →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

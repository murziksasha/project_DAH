'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { apiFetch, getToken } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
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
      setError(expensesQuery.error instanceof Error ? expensesQuery.error.message : 'Помилка');
    }
  }, [expensesQuery.error]);

  async function voidExpense(id: string) {
    const reason = window.prompt('Причина анулювання витрати?');
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
      setMessage('Витрату анульовано');
      await expensesQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка анулювання');
    } finally {
      setVoidingId(null);
    }
  }

  function exportCsv() {
    const rows: Array<Array<string | number>> = [
      ['Дата', 'Опис', 'Категорія', 'Фонд', 'Постачальник', 'Сума'],
      ...expenses.map((e) => [
        formatDateUk(e.date),
        e.description ?? '',
        e.category.name,
        e.fund.name,
        e.supplier?.name ?? '',
        Number(e.amount),
      ]),
    ];
    downloadCsv(`vytraty-p${page}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  const pageTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <main>
      <Link href="/admin/expenses" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← Нова витрата
      </Link>
      <PageHeader
        title="Витрати ОСМД"
        description="Фільтр, пагінація, CSV, анулювання"
        actions={
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={exportCsv} disabled={!expenses.length}>
              CSV (сторінка)
            </button>
            <Link href="/admin/expenses" className="btn btn-sm">
              + Витрата
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
          <label>Фонд</label>
          <select
            value={fundId}
            onChange={(e) => {
              setPage(1);
              setFundId(e.target.value);
            }}
          >
            <option value="">Усі фонди</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Від</label>
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
          <label>До</label>
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
            Оновити
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      {!loading && (
        <p style={{ color: 'var(--muted)', marginBottom: '0.75rem' }}>
          Всього: {total} · стор. {page}/{totalPages} · на сторінці {formatMoney(pageTotal)}
        </p>
      )}

      <section className="card">
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
        ) : expenses.length === 0 ? (
          <EmptyState
            title="Витрат не знайдено"
            description="Змініть фільтр або додайте першу витрату."
            actionHref="/admin/expenses"
            actionLabel="Нова витрата"
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
                          Платіжка
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={voidingId === e.id}
                        onClick={() => voidExpense(e.id)}
                      >
                        Анулювати
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
              ← Назад
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Далі →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

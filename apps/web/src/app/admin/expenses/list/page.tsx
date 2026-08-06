'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { downloadXlsx } from '@/lib/xlsx';
import { formatDateUk, formatMoney } from '@/lib/money';
import { useExpensesPageQuery, useFundsQuery } from '@/lib/queries';

interface Expense {
  id: string;
  amount: string;
  date: string;
  description: string | null;
  documentUrl: string | null;
  approvalStatus?: string;
  needsApproval?: boolean;
  fund: { id: string; name: string };
  category: { name: string };
  supplier: { name: string } | null;
  createdBy?: { id?: string; firstName: string; lastName: string } | null;
  approvedBy?: { id?: string; firstName: string; lastName: string } | null;
}

type ApprovalFilter = '' | 'pending' | 'approved';

export default function ExpensesListPage() {
  const { t } = useI18n();
  const me = getStoredUser();
  const [fundId, setFundId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<Expense | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const fundsQuery = useFundsQuery(Boolean(getToken()));
  const expensesQuery = useExpensesPageQuery(
    {
      fundId: fundId || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      limit: 30,
      approvalStatus: approvalFilter || undefined,
    },
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

  async function voidExpense(expense: Expense, reason: string) {
    const token = getToken();
    if (!token) return;
    setVoidingId(expense.id);
    setError('');
    try {
      await apiFetch(`/finance/expenses/${expense.id}/void`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setMessage(t('expenseVoided'));
      setConfirmVoid(null);
      setVoidReason('');
      await expensesQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('expenseVoidError'));
    } finally {
      setVoidingId(null);
    }
  }

  async function approveExpense(expense: Expense) {
    const token = getToken();
    if (!token) return;
    setApprovingId(expense.id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/finance/expenses/${expense.id}/approve`, {
        method: 'POST',
        token,
      });
      setMessage(t('expenseApproved'));
      setConfirmApprove(null);
      await expensesQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('expenseApproveError'));
    } finally {
      setApprovingId(null);
    }
  }

  async function exportExcel() {
    await downloadXlsx(`vytraty-p${page}-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: 'Витрати',
        rows: [
          ['Дата', 'Опис', 'Категорія', 'Фонд', 'Постачальник', 'Статус', 'Сума'],
          ...expenses.map((e) => [
            formatDateUk(e.date),
            e.description ?? '',
            e.category.name,
            e.fund.name,
            e.supplier?.name ?? '',
            e.approvalStatus === 'pending' ? 'pending' : 'approved',
            Number(e.amount),
          ]),
        ],
      },
    ]);
  }

  const pageTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const canApprove =
    me?.role === 'chairman' || me?.role === 'board' || me?.role === 'accountant';

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
          <label>{t('expenseStatus')}</label>
          <select
            value={approvalFilter}
            onChange={(e) => {
              setPage(1);
              setApprovalFilter(e.target.value as ApprovalFilter);
            }}
          >
            <option value="">{t('expenseFilterAll')}</option>
            <option value="pending">{t('expenseFilterPending')}</option>
            <option value="approved">{t('expenseFilterApproved')}</option>
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
            {expenses.map((e) => {
              const pending = e.approvalStatus === 'pending' || e.needsApproval;
              const isCreator = e.createdBy?.id && me?.id && e.createdBy.id === me.id;
              const showApprove = canApprove && pending && !isCreator;

              return (
                <li
                  key={e.id}
                  style={{
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: pending ? '3px solid var(--warning)' : undefined,
                    paddingLeft: pending ? '0.75rem' : undefined,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{e.description ?? e.category.name}</span>
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 999,
                            background: pending ? 'var(--health-bg)' : 'var(--surface-2)',
                            color: pending ? 'var(--health-text)' : 'var(--muted)',
                            fontWeight: 600,
                          }}
                        >
                          {pending ? t('expenseStatusPending') : t('expenseStatusApproved')}
                        </span>
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {e.fund.name}
                        {e.supplier ? ` · ${e.supplier.name}` : ''}
                        {' · '}
                        {formatDateUk(e.date)} · {e.category.name}
                      </div>
                      {e.createdBy && (
                        <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 2 }}>
                          {t('expenseCreatedBy')}: {e.createdBy.lastName} {e.createdBy.firstName}
                          {e.approvedBy
                            ? ` · ✓ ${e.approvedBy.lastName} ${e.approvedBy.firstName}`
                            : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--danger)' }}>
                        −{formatMoney(e.amount)}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          justifyContent: 'flex-end',
                          marginTop: '0.35rem',
                          flexWrap: 'wrap',
                        }}
                      >
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
                        {showApprove && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={approvingId === e.id}
                            onClick={() => setConfirmApprove(e)}
                          >
                            {t('expenseApprove')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={voidingId === e.id}
                          onClick={() => {
                            setVoidReason('');
                            setConfirmVoid(e);
                          }}
                        >
                          {t('voidAction')}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
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

      <ConfirmDialog
        open={Boolean(confirmApprove)}
        title={t('expenseApproveTitle')}
        message={
          confirmApprove
            ? `${t('expenseApproveBody')} (−${formatMoney(confirmApprove.amount)}${
                confirmApprove.description ? `: ${confirmApprove.description}` : ''
              })`
            : t('expenseApproveBody')
        }
        confirmLabel={t('expenseApprove')}
        cancelLabel={t('cancel')}
        busy={Boolean(approvingId)}
        onConfirm={() => {
          if (confirmApprove) void approveExpense(confirmApprove);
        }}
        onCancel={() => setConfirmApprove(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmVoid)}
        title={t('voidAction')}
        message={
          confirmVoid
            ? `${t('expenseVoidPrompt')} (−${formatMoney(confirmVoid.amount)})`
            : t('expenseVoidPrompt')
        }
        confirmLabel={t('voidAction')}
        cancelLabel={t('cancel')}
        danger
        busy={Boolean(voidingId)}
        confirmDisabled={voidReason.trim().length < 2}
        onConfirm={() => {
          if (confirmVoid && voidReason.trim()) void voidExpense(confirmVoid, voidReason);
        }}
        onCancel={() => {
          setConfirmVoid(null);
          setVoidReason('');
        }}
      >
        <div style={{ marginTop: 12 }}>
          <label htmlFor="void-reason">{t('expenseVoidReason')}</label>
          <input
            id="void-reason"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder={t('expenseVoidReasonPh')}
            autoFocus
          />
        </div>
      </ConfirmDialog>
    </main>
  );
}

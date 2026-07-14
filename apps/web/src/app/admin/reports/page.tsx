'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { downloadAuthFile } from '@/lib/download';
import { formatDateUk, formatMoney } from '@/lib/money';

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

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyPdf, setBusyPdf] = useState(false);
  const [busyNotify, setBusyNotify] = useState(false);
  const [message, setMessage] = useState('');

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
      const [d, c] = await Promise.all([
        apiFetch<Debtor[]>('/payments/reports/debtors', { token }),
        apiFetch<CashFlowReport>(`/finance/reports/cash-flow${q ? `?${q}` : ''}`, { token }),
      ]);
      setDebtors(d);
      setCashFlow(c);
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

  function exportDebtorsCsv() {
    const rows: Array<Array<string | number>> = [
      ['Квартира', "Під'їзд", 'Борг', 'Рядків', 'Найстаріший термін', 'Статус'],
      ...debtors.map((d) => [
        d.number,
        d.entrance,
        d.debt,
        d.lines,
        d.oldestDue ? formatDateUk(d.oldestDue) : '',
        d.isOverdue ? 'Прострочено' : 'До сплати',
      ]),
    ];
    downloadCsv(`borzhnyky-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportCashFlowCsv() {
    if (!cashFlow) return;
    const rows: Array<Array<string | number>> = [
      ['Показник', 'Сума'],
      ['Надходження', cashFlow.totalIncome],
      ['Витрати', cashFlow.totalExpenses],
      ['Чистий рух', cashFlow.netFlow],
      ['Дебіторка', totalDebt],
      [],
      ['Фонд', 'Баланс', 'Надходження', 'Витрати'],
      ...cashFlow.fundBalances.map((f) => [f.fundName, f.balance, f.income, f.expenses]),
    ];
    downloadCsv(`rukh-koshtiv-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async function downloadBoardPdf() {
    setBusyPdf(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const q = qs.toString();
      await downloadAuthFile(
        `/finance/reports/board.pdf${q ? `?${q}` : ''}`,
        'zvit-osmd.pdf',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка PDF');
    } finally {
      setBusyPdf(false);
    }
  }

  async function notifyDebtors() {
    if (
      !window.confirm(
        `Надіслати email-нагадування всім боржникам (${debtors.length})? Потрібен SMTP або листи підуть у лог.`,
      )
    ) {
      return;
    }
    const token = getToken();
    if (!token) return;
    setBusyNotify(true);
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{ debtSent: number }>('/reminders/notify-debtors', {
        method: 'POST',
        token,
      });
      setMessage(`Надіслано нагадувань: ${res.debtSent}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка розсилки');
    } finally {
      setBusyNotify(false);
    }
  }

  return (
    <main>
      <PageHeader
        title="Звіти"
        description="Рух коштів, боржники, PDF для зборів"
        actions={
          <>
            <button type="button" className="btn btn-sm btn-ghost" onClick={exportCashFlowCsv} disabled={!cashFlow}>
              CSV: рух
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={exportDebtorsCsv}
              disabled={debtors.length === 0}
            >
              CSV: боржники
            </button>
            <button type="button" className="btn btn-sm" onClick={downloadBoardPdf} disabled={busyPdf}>
              {busyPdf ? 'PDF…' : 'PDF для зборів'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={notifyDebtors}
              disabled={busyNotify || debtors.length === 0}
            >
              {busyNotify ? 'Розсилка…' : 'Email боржникам'}
            </button>
          </>
        }
      />

      <div
        className="card"
        style={{
          display: 'grid',
          gap: '1rem',
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
          Застосувати
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}
      {loading && <SkeletonCards count={4} />}

      {!loading && cashFlow && (
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <StatCard label="Надходження" value={formatMoney(cashFlow.totalIncome)} tone="success" />
          <StatCard label="Витрати" value={formatMoney(cashFlow.totalExpenses)} tone="danger" />
          <StatCard label="Чистий рух" value={formatMoney(cashFlow.netFlow, { signed: true })} />
          <StatCard label="Загальна дебіторка" value={formatMoney(totalDebt)} tone="danger" />
        </div>
      )}

      {!loading && cashFlow?.fundBalances && cashFlow.fundBalances.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Баланс фондів</h2>
          <div className="grid-2">
            {cashFlow.fundBalances.map((f) => (
              <div
                key={f.fundName}
                style={{ padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 8 }}
              >
                <div style={{ fontWeight: 600 }}>{f.fundName}</div>
                <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                  {formatMoney(f.balance)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
          Реєстр боржників ({debtors.length})
        </h2>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
        ) : debtors.length === 0 ? (
          <EmptyState
            title="Боржників немає"
            description="Усі особові рахунки закриті або без відкритих нарахувань."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Кв.</th>
                  <th>Під&apos;їзд</th>
                  <th>Борг</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {debtors.map((d) => (
                  <tr key={d.apartmentId}>
                    <td>{d.number}</td>
                    <td>{d.entrance}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(d.debt)}</td>
                    <td style={{ color: d.isOverdue ? 'var(--danger)' : 'var(--muted)' }}>
                      {d.isOverdue ? 'Прострочено' : 'До сплати'}
                    </td>
                    <td>
                      <Link href={`/admin/apartments/${d.apartmentId}`} className="btn btn-sm btn-ghost">
                        Рахунок
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

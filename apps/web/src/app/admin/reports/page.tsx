'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  enabledExportFieldKeys,
  getExportProfile,
  normalizeDocumentTemplatesConfig,
  type DocumentTemplatesConfig,
} from '@dah/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { downloadAuthFile } from '@/lib/download';
import { formatDateUk, formatMoney } from '@/lib/money';
import { downloadXlsx } from '@/lib/xlsx';

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

function pickRow(keys: string[], map: Record<string, string | number>) {
  return keys.map((k) => map[k] ?? '');
}

export default function ReportsPage() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [exportConfig, setExportConfig] = useState<DocumentTemplatesConfig | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyPdf, setBusyPdf] = useState(false);
  const [busyPack, setBusyPack] = useState(false);
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
      const [d, c, templates] = await Promise.all([
        apiFetch<Debtor[]>('/payments/reports/debtors', { token }),
        apiFetch<CashFlowReport>(`/finance/reports/cash-flow${q ? `?${q}` : ''}`, { token }),
        apiFetch<DocumentTemplatesConfig>('/building/document-templates', { token }).catch(
          () => null,
        ),
      ]);
      setDebtors(d);
      setCashFlow(c);
      if (templates) setExportConfig(normalizeDocumentTemplatesConfig(templates));
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

  async function exportDebtorsXlsx() {
    const stamp = new Date().toISOString().slice(0, 10);
    const profile = exportConfig
      ? getExportProfile(exportConfig, 'debtors')
      : undefined;
    const keys = enabledExportFieldKeys(profile);
    const activeKeys =
      keys.length > 0
        ? keys
        : ['number', 'entrance', 'debt', 'lines', 'oldestDue', 'isOverdue'];
    const labelByKey: Record<string, string> = Object.fromEntries(
      (profile?.fields ?? []).map((f) => [f.key, f.label]),
    );
    const defaults: Record<string, string> = {
      number: 'Квартира',
      entrance: "Під'їзд",
      debt: 'Борг',
      lines: 'Рядків',
      oldestDue: 'Найстаріший термін',
      isOverdue: 'Статус',
    };
    await downloadXlsx(`borzhnyky-${stamp}.xlsx`, [
      {
        name: 'Боржники',
        rows: [
          activeKeys.map((k) => labelByKey[k] ?? defaults[k] ?? k),
          ...debtors.map((d) =>
            pickRow(activeKeys, {
              number: d.number,
              entrance: d.entrance,
              debt: d.debt,
              lines: d.lines,
              oldestDue: d.oldestDue ? formatDateUk(d.oldestDue) : '',
              isOverdue: d.isOverdue ? 'Прострочено' : 'До сплати',
            }),
          ),
        ],
      },
    ]);
  }

  async function exportCashFlowXlsx() {
    if (!cashFlow) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const profile = exportConfig
      ? getExportProfile(exportConfig, 'cash_flow')
      : undefined;
    const keys = new Set(
      enabledExportFieldKeys(profile).length
        ? enabledExportFieldKeys(profile)
        : ['metric', 'amount', 'fundName', 'fundBalance', 'fundIncome', 'fundExpenses'],
    );

    const summaryRows: Array<Array<string | number>> = [
      ['Період від', from],
      ['Період до', to],
      [],
    ];
    if (keys.has('metric') || keys.has('amount')) {
      summaryRows.push(['Показник', 'Сума']);
      summaryRows.push(['Надходження', cashFlow.totalIncome]);
      summaryRows.push(['Витрати', cashFlow.totalExpenses]);
      summaryRows.push(['Чистий рух', cashFlow.netFlow]);
      summaryRows.push(['Дебіторка', totalDebt]);
    }

    const fundHeader = [
      keys.has('fundName') ? 'Фонд' : null,
      keys.has('fundBalance') ? 'Баланс' : null,
      keys.has('fundIncome') ? 'Надходження' : null,
      keys.has('fundExpenses') ? 'Витрати' : null,
    ].filter(Boolean) as string[];

    const fundRows =
      fundHeader.length > 0
        ? [
            fundHeader,
            ...cashFlow.fundBalances.map((f) =>
              [
                keys.has('fundName') ? f.fundName : null,
                keys.has('fundBalance') ? f.balance : null,
                keys.has('fundIncome') ? f.income : null,
                keys.has('fundExpenses') ? f.expenses : null,
              ].filter((v) => v !== null) as Array<string | number>,
            ),
          ]
        : [];

    await downloadXlsx(`rukh-koshtiv-${stamp}.xlsx`, [
      { name: 'Підсумок', rows: summaryRows },
      ...(fundRows.length ? [{ name: 'Фонди', rows: fundRows }] : []),
    ]);
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

  async function downloadExportPack() {
    setBusyPack(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const q = qs.toString();
      await downloadAuthFile(
        `/finance/reports/export-pack.zip${q ? `?${q}` : ''}`,
        'dah-export.zip',
      );
      setMessage('Пакет експорту завантажено (Excel .xlsx)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка export pack');
    } finally {
      setBusyPack(false);
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
        description="Рух коштів, боржники, PDF для зборів · колонки — у конструкторі документів"
        actions={
          <>
            <Link href="/admin/document-templates" className="btn btn-sm btn-ghost">
              Конструктор
            </Link>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void downloadExportPack()}
              disabled={busyPack}
            >
              {busyPack ? 'ZIP…' : 'Export pack (Excel)'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void exportCashFlowXlsx()}
              disabled={!cashFlow}
            >
              Excel: рух
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void exportDebtorsXlsx()}
              disabled={debtors.length === 0}
            >
              Excel: боржники
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
                      <Link href={`/admin/apartments/detail/?id=${encodeURIComponent(d.apartmentId)}`} className="btn btn-sm btn-ghost">
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

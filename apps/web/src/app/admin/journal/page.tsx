'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getSelectedBuildingId } from '@/lib/building-context';

interface JournalLine {
  id: string;
  account: string;
  debit: string | number;
  credit: string | number;
  apartmentId?: string | null;
  fundId?: string | null;
}

interface JournalEntry {
  id: string;
  type: string;
  description?: string | null;
  entryNo?: number | null;
  period?: string | null;
  valueDate?: string | null;
  createdAt: string;
  refType: string;
  refId: string;
  lines: JournalLine[];
}

interface TbAccount {
  account: string;
  debit: number;
  credit: number;
  balance: number;
}

interface ReconcileResult {
  ok: boolean;
  mismatchCount: number;
  trialBalance?: { totalDebit: number; totalCredit: number; balanced: boolean };
  mismatches: Array<{
    kind: string;
    id: string;
    label: string;
    legacy: number;
    journal: number;
    diff: number;
  }>;
}

function money(n: number | string) {
  const v = typeof n === 'string' ? Number(n) : n;
  return Number.isFinite(v)
    ? v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
}

export default function JournalPage() {
  const [buildingId, setBuildingId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tb, setTb] = useState<{
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
    accounts: TbAccount[];
  } | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'journal' | 'tb' | 'reconcile' | 'shadow'>('journal');
  const [shadow, setShadow] = useState<{
    readyForSot: boolean;
    reconcileOk: boolean;
    advancesOk: boolean;
    mismatchCount: number;
    fundBalances: Array<{
      name: string;
      cashFromJournal: number;
      expenseFromJournal: number;
      fundEquityFromJournal: number;
    }>;
  } | null>(null);
  const [adjDesc, setAdjDesc] = useState('');
  const [adjDrAccount, setAdjDrAccount] = useState('expense');
  const [adjCrAccount, setAdjCrAccount] = useState('cash');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjMsg, setAdjMsg] = useState('');

  const load = useCallback(async (bid: string) => {
    const token = getToken();
    if (!token || !bid) return;
    setLoading(true);
    setError('');
    try {
      const q = `buildingId=${encodeURIComponent(bid)}&period=${encodeURIComponent(period)}&limit=100`;
      const [list, trial, rec, sh] = await Promise.all([
        apiFetch<JournalEntry[]>(`/journal?${q}`, { token }),
        apiFetch<{
          totalDebit: number;
          totalCredit: number;
          balanced: boolean;
          accounts: TbAccount[];
        }>(`/journal/trial-balance?buildingId=${encodeURIComponent(bid)}&period=${encodeURIComponent(period)}`, {
          token,
        }),
        apiFetch<ReconcileResult>(
          `/journal/reconcile?buildingId=${encodeURIComponent(bid)}`,
          { token },
        ),
        apiFetch<{
          readyForSot: boolean;
          reconcileOk: boolean;
          advancesOk: boolean;
          mismatchCount: number;
          fundBalances: Array<{
            name: string;
            cashFromJournal: number;
            expenseFromJournal: number;
            fundEquityFromJournal: number;
          }>;
        }>(`/journal/shadow-compare?buildingId=${encodeURIComponent(bid)}`, {
          token,
        }).catch(() => null),
      ]);
      setEntries(Array.isArray(list) ? list : []);
      setTb(trial);
      setReconcile(rec);
      setShadow(sh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const bid = getSelectedBuildingId() || '';
    setBuildingId(bid);
    if (bid) void load(bid);
  }, [load]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Журнал проводок / ОСВ"
        description="Подвійний запис, trial balance, reconcile"
      />

      <div className="card row-wrap gap-2 items-end">
        <label className="field">
          <span>Період</span>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!buildingId || loading}
          onClick={() => load(buildingId)}
        >
          Оновити
        </button>
        <div className="tabs-inline">
          {(['journal', 'tb', 'reconcile', 'shadow'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)}
            >
              {t === 'journal'
                ? 'Журнал'
                : t === 'tb'
                  ? 'ОСВ'
                  : t === 'reconcile'
                    ? 'Reconcile'
                    : 'Shadow SoT'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!buildingId && (
        <div className="alert">Оберіть будинок у селекторі зверху.</div>
      )}

      {tab === 'journal' && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Тип</th>
                <th>Опис</th>
                <th>Дт</th>
                <th>Кт</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const d = e.lines.reduce((s, l) => s + Number(l.debit), 0);
                const c = e.lines.reduce((s, l) => s + Number(l.credit), 0);
                return (
                  <Fragment key={e.id}>
                    <tr
                      className="clickable"
                      onClick={() =>
                        setExpanded(expanded === e.id ? null : e.id)
                      }
                    >
                      <td>{e.entryNo ?? '—'}</td>
                      <td>
                        {(e.valueDate || e.createdAt || '').slice(0, 10)}
                      </td>
                      <td>
                        <code>{e.type}</code>
                      </td>
                      <td>{e.description ?? `${e.refType}/${e.refId.slice(-6)}`}</td>
                      <td className="num">{money(d)}</td>
                      <td className="num">{money(c)}</td>
                    </tr>
                    {expanded === e.id && (
                      <tr>
                        <td colSpan={6}>
                          <table className="table table-nested">
                            <thead>
                              <tr>
                                <th>Рахунок</th>
                                <th>Дебет</th>
                                <th>Кредит</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.lines.map((l) => (
                                <tr key={l.id}>
                                  <td>
                                    <code>{l.account}</code>
                                  </td>
                                  <td className="num">{money(l.debit)}</td>
                                  <td className="num">{money(l.credit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!entries.length && !loading && (
                <tr>
                  <td colSpan={6}>Немає проводок за період</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tb' && tb && (
        <div className="card">
          <p>
            Σ Дт <strong>{money(tb.totalDebit)}</strong> · Σ Кт{' '}
            <strong>{money(tb.totalCredit)}</strong>{' '}
            {tb.balanced ? (
              <span className="badge badge-ok">збалансовано</span>
            ) : (
              <span className="badge badge-warn">розбіжність</span>
            )}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Рахунок</th>
                <th>Дебет</th>
                <th>Кредит</th>
                <th>Сальдо (Дт−Кт)</th>
              </tr>
            </thead>
            <tbody>
              {tb.accounts.map((a) => (
                <tr key={a.account}>
                  <td>
                    <code>{a.account}</code>
                  </td>
                  <td className="num">{money(a.debit)}</td>
                  <td className="num">{money(a.credit)}</td>
                  <td className="num">{money(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'reconcile' && reconcile && (
        <div className="card">
          <p>
            {reconcile.ok ? (
              <span className="badge badge-ok">OK · 0 mismatches</span>
            ) : (
              <span className="badge badge-warn">
                {reconcile.mismatchCount} розбіжностей
              </span>
            )}
          </p>
          {reconcile.trialBalance && (
            <p className="muted">
              TB: Дт {money(reconcile.trialBalance.totalDebit)} / Кт{' '}
              {money(reconcile.trialBalance.totalCredit)}
            </p>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Обʼєкт</th>
                <th>Legacy</th>
                <th>Journal</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {reconcile.mismatches.map((m) => (
                <tr key={`${m.kind}-${m.id}`}>
                  <td>
                    <code>{m.kind}</code>
                  </td>
                  <td>{m.label}</td>
                  <td className="num">{money(m.legacy)}</td>
                  <td className="num">{money(m.journal)}</td>
                  <td className="num">{money(m.diff)}</td>
                </tr>
              ))}
              {!reconcile.mismatches.length && (
                <tr>
                  <td colSpan={5}>Розбіжностей немає</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'shadow' && (
        <>
          {shadow && (
            <div className="card">
              <p>
                Ready for SoT cutover:{' '}
                {shadow.readyForSot ? (
                  <span className="badge badge-ok">yes</span>
                ) : (
                  <span className="badge badge-warn">no</span>
                )}{' '}
                · reconcile{' '}
                {shadow.reconcileOk ? 'OK' : `${shadow.mismatchCount} diff`} ·
                advances {shadow.advancesOk ? 'OK' : 'mismatch'}
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Фонд</th>
                    <th>Cash (journal)</th>
                    <th>Expense (journal)</th>
                    <th>Fund equity (journal)</th>
                  </tr>
                </thead>
                <tbody>
                  {shadow.fundBalances.map((f) => (
                    <tr key={f.name}>
                      <td>{f.name}</td>
                      <td className="num">{money(f.cashFromJournal)}</td>
                      <td className="num">{money(f.expenseFromJournal)}</td>
                      <td className="num">{money(f.fundEquityFromJournal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <form
            className="card form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const token = getToken();
              if (!token || !buildingId) return;
              const amt = Number(adjAmount);
              if (!(amt > 0)) {
                setError('Сума > 0');
                return;
              }
              setAdjMsg('');
              setError('');
              try {
                await apiFetch('/accounting/adjustments', {
                  token,
                  method: 'POST',
                  body: JSON.stringify({
                    buildingId,
                    description: adjDesc || 'Manual adjustment',
                    lines: [
                      { account: adjDrAccount, debit: amt },
                      { account: adjCrAccount, credit: amt },
                    ],
                  }),
                });
                setAdjMsg('Коригуючу проводку проведено');
                setAdjAmount('');
                await load(buildingId);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Помилка adjustment');
              }
            }}
          >
            <h3>Ручна коригуюча проводка</h3>
            <label className="field">
              <span>Опис</span>
              <input
                value={adjDesc}
                onChange={(e) => setAdjDesc(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Дебет (рахунок)</span>
              <select
                value={adjDrAccount}
                onChange={(e) => setAdjDrAccount(e.target.value)}
              >
                {['expense', 'receivable', 'cash', 'write_off', 'fund_balance', 'payable'].map(
                  (a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="field">
              <span>Кредит (рахунок)</span>
              <select
                value={adjCrAccount}
                onChange={(e) => setAdjCrAccount(e.target.value)}
              >
                {['cash', 'advance', 'receivable', 'fund_balance', 'payable', 'income'].map(
                  (a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="field">
              <span>Сума</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Провести
            </button>
            {adjMsg && <p className="success-banner">{adjMsg}</p>}
          </form>
        </>
      )}
    </div>
  );
}

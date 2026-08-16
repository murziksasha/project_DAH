'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { downloadAuthFile } from '@/lib/download';
import { formatDateUk, formatMoney } from '@/lib/money';

interface AccrualLine {
  id: string;
  amount: string;
  paidAmount: string;
  status: string;
  apartment: { id: string; number: string };
}

interface Accrual {
  id: string;
  period: string;
  title: string;
  createdAt: string;
  fund: { name: string };
  lines: AccrualLine[];
}

export default function AccrualsListPage() {
  const { t } = useI18n();
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [period, setPeriod] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const qs = period ? `?period=${period}` : '';
    const data = await apiFetch<Accrual[]>(`/accruals${qs}`, { token });
    setAccruals(data);
  }, [period]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function download(kind: 'zip' | 'pdf', id: string) {
    setBusy(`${kind}-${id}`);
    setError('');
    try {
      await downloadAuthFile(
        `/accruals/${id}/receipts.${kind}`,
        `kvytantsii.${kind}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accrualDownloadError'));
    } finally {
      setBusy(null);
    }
  }

  async function reverseAccrual(id: string, title: string) {
    if (!window.confirm(`Сторнувати відкритий залишок «${title}»?`)) return;
    const token = getToken();
    if (!token) return;
    setBusy(`rev-${id}`);
    setError('');
    try {
      await apiFetch(`/accruals/${id}/reverse`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason: 'UI reverse' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusy(null);
    }
  }

  async function creditNoteLine(lineId: string, openBal: number, aptNumber: string) {
    if (openBal <= 0) {
      setError('Немає відкритого залишку для credit note');
      return;
    }
    const raw = window.prompt(
      `Credit note кв. ${aptNumber} (макс ${openBal.toFixed(2)} ₴)`,
      String(Math.min(openBal, openBal)),
    );
    if (!raw) return;
    const amount = Number(raw.replace(',', '.'));
    if (!(amount > 0) || amount > openBal + 0.001) {
      setError('Некоректна сума credit note');
      return;
    }
    const reason = window.prompt('Причина (опційно)', 'Коригування') ?? undefined;
    const token = getToken();
    if (!token) return;
    setBusy(`cn-${lineId}`);
    setError('');
    try {
      await apiFetch(`/accruals/lines/${lineId}/credit-note`, {
        method: 'POST',
        token,
        body: JSON.stringify({ amount, reason: reason || undefined }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <Link href="/admin/accruals" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← {t('accruals')}
      </Link>
      <PageHeader title={t('accrualListTitle')} description={t('accrualListDesc')} />

      <div
        className="card"
        style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          alignItems: 'end',
        }}
      >
        <div style={{ flex: 1, minWidth: 160 }}>
          <label>{t('accrualPeriodShort')}</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => load().catch((e) => setError(e.message))}>
          {t('filter')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {accruals.length === 0 ? (
        <EmptyState
          title={t('accrualEmpty')}
          description={t('accrualEmptyDesc')}
          actionHref="/admin/accruals"
          actionLabel={t('accruals')}
        />
      ) : (
        accruals.map((a) => {
          const total = a.lines.reduce((s, l) => s + Number(l.amount), 0);
          const paid = a.lines.reduce((s, l) => s + Number(l.paidAmount), 0);
          const open = expanded === a.id;
          return (
            <section key={a.id} className="card" style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <h2 style={{ fontSize: '1.1rem' }}>{a.title}</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                    {a.period} · {a.fund.name} · {a.lines.length} {t('aptPrefix')} · {formatMoney(total)}
                    {paid > 0 && t('accrualPaidSuffix', { amount: formatMoney(paid) })}
                  </p>
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {formatDateUk(a.createdAt)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={busy === `pdf-${a.id}`}
                    onClick={() => download('pdf', a.id)}
                  >
                    {t('receiptsPdf')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={busy === `zip-${a.id}`}
                    onClick={() => download('zip', a.id)}
                  >
                    {t('receiptsZip')}
                  </button>
                  {!a.title.startsWith('Сторно:') && !a.title.startsWith('Пеня ') && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busy === `rev-${a.id}`}
                      onClick={() => void reverseAccrual(a.id, a.title)}
                    >
                      Сторно
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setExpanded(open ? null : a.id)}
                  >
                    {open ? t('collapse') : t('accrualLinesBtn')}
                  </button>
                </div>
              </div>

              {open && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('metersColApt')}</th>
                        <th>{t('amount')}</th>
                        <th>{t('paid')}</th>
                        <th>{t('status')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {a.lines.map((l) => {
                        const openBal = Math.max(
                          0,
                          Number(l.amount) - Number(l.paidAmount),
                        );
                        return (
                        <tr key={l.id}>
                          <td>
                            <Link href={`/admin/apartments/detail/?id=${encodeURIComponent(l.apartment.id)}`}>
                              {l.apartment.number}
                            </Link>
                          </td>
                          <td>{formatMoney(l.amount)}</td>
                          <td>{formatMoney(l.paidAmount)}</td>
                          <td>{l.status}</td>
                          <td className="row-wrap gap-1">
                            <Link href={`/admin/apartments/detail/?id=${encodeURIComponent(l.apartment.id)}`} className="btn btn-sm btn-ghost">
                              {t('accountShort')}
                            </Link>
                            {openBal > 0 &&
                              !a.title.startsWith('Сторно:') &&
                              !a.title.startsWith('Пеня ') && (
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                disabled={busy === `cn-${l.id}`}
                                onClick={() =>
                                  void creditNoteLine(l.id, openBal, l.apartment.number)
                                }
                              >
                                Credit note
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}

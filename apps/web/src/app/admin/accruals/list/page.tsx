'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { downloadAuthFile } from '@/lib/download';
import { formatDateUk, formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

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
      setError(err instanceof Error ? err.message : 'Помилка завантаження');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <Link href="/admin/accruals" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← {t('accruals')}
      </Link>
      <PageHeader title="Історія нарахувань" description="Масові квитанції PDF / ZIP" />

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
          <label>Період</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => load().catch((e) => setError(e.message))}>
          Фільтр
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {accruals.length === 0 ? (
        <EmptyState
          title="Нарахувань ще немає"
          description="Створіть нарахування за період — тут з’являться квитанції."
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
                    {a.period} · {a.fund.name} · {a.lines.length} кв. · {formatMoney(total)}
                    {paid > 0 && ` · сплачено ${formatMoney(paid)}`}
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
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setExpanded(open ? null : a.id)}
                  >
                    {open ? 'Згорнути' : 'Рядки'}
                  </button>
                </div>
              </div>

              {open && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Кв.</th>
                        <th>Сума</th>
                        <th>Сплачено</th>
                        <th>Статус</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {a.lines.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <Link href={`/admin/apartments/${l.apartment.id}`}>
                              {l.apartment.number}
                            </Link>
                          </td>
                          <td>{formatMoney(l.amount)}</td>
                          <td>{formatMoney(l.paidAmount)}</td>
                          <td>{l.status}</td>
                          <td>
                            <Link href={`/admin/apartments/${l.apartment.id}`} className="btn btn-sm btn-ghost">
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
          );
        })
      )}
    </main>
  );
}

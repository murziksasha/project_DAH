'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, downloadReceipt, getApiBaseUrl, getToken } from '@/lib/api';
import { formatDateUk, formatMoney } from '@/lib/money';

interface Account {
  apartment: {
    id: string;
    number: string;
    entrance: number;
    area: number;
    buildingName: string;
  };
  summary: { totalAccrued: number; totalPaid: number; debt: number; advance: number };
  lines: Array<{
    id: string;
    period: string;
    title: string;
    fundName: string;
    amount: number;
    paidAmount: number;
    balance: number;
    status: string;
    dueDate: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    date: string;
    source: string;
    reference: string | null;
  }>;
}

/** Static-export safe apartment account (query ?id= instead of dynamic [id] segment). */
function ApartmentAccountInner() {
  const { t } = useI18n();
  const search = useSearchParams();
  const id = String(search.get('id') ?? '');
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const STATUS: Record<string, string> = {
    open: t('aptStatusOpen'),
    partially_paid: t('aptStatusPartial'),
    paid: t('aptStatusPaid'),
    overdue: t('aptStatusOverdue'),
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login/';
      return;
    }
    if (!id) {
      setError(t('noData'));
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch<Account>(`/accruals/apartments/${id}/account`, { token })
      .then(setAccount)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, t]);

  return (
    <main>
      <Link href="/admin/reports/" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← {t('reports')}
      </Link>
      <PageHeader
        title={
          account
            ? t('aptTitleNum', {
                title: t('apartmentAccount'),
                number: account.apartment.number,
              })
            : t('apartmentAccount')
        }
        description={
          account
            ? t('aptMeta', {
                building: account.apartment.buildingName,
                entrance: account.apartment.entrance,
                area: account.apartment.area,
              })
            : undefined
        }
      />

      {error && <p className="error">{error}</p>}
      {account && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              const token = getToken();
              if (!token) return;
              const res = await fetch(
                `${getApiBaseUrl()}/accruals/apartments/${id}/statement.xlsx`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              if (!res.ok) {
                setError(t('aptExportFail'));
                return;
              }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `account-kv-${account.apartment.number}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('aptExportExcel')}
          </button>
        </div>
      )}
      {loading && <SkeletonCards count={3} />}

      {account && (
        <>
          <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
            <StatCard
              label={t('debt')}
              value={formatMoney(account.summary.debt)}
              tone={account.summary.debt > 0 ? 'danger' : 'success'}
            />
            <StatCard label={t('paid')} value={formatMoney(account.summary.totalPaid)} />
            <StatCard label={t('aptAccrued')} value={formatMoney(account.summary.totalAccrued)} />
            <StatCard label={t('aptAdvance')} value={formatMoney(account.summary.advance)} />
          </div>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{t('aptAccruals')}</h2>
            {account.lines.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {account.lines.map((line) => (
                  <li
                    key={line.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{line.title}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {line.period} · {line.fundName}{' '}
                        <Badge
                          tone={
                            line.status === 'paid'
                              ? 'success'
                              : line.status === 'overdue'
                                ? 'danger'
                                : 'muted'
                          }
                        >
                          {STATUS[line.status] ?? line.status}
                        </Badge>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>
                        {formatMoney(line.balance > 0 ? line.balance : line.amount)}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ marginTop: '0.25rem' }}
                        onClick={() => {
                          const token = getToken();
                          if (token) downloadReceipt(line.id, token).catch((e) => setError(e.message));
                        }}
                      >
                        PDF
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{t('aptPayments')}</h2>
            {account.payments.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th>{t('amount')}</th>
                      <th>{t('aptSource')}</th>
                      <th>{t('aptReference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{formatDateUk(p.date)}</td>
                        <td>{formatMoney(p.amount)}</td>
                        <td>{p.source}</td>
                        <td>{p.reference ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default function ApartmentAccountPage() {
  return (
    <Suspense fallback={<main><SkeletonCards count={3} /></main>}>
      <ApartmentAccountInner />
    </Suspense>
  );
}

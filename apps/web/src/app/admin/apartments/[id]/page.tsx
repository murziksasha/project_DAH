'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, downloadReceipt, getApiBaseUrl, getToken } from '@/lib/api';
import { formatDateUk, formatMoney } from '@/lib/money';
import { t } from '@/lib/i18n';

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

const STATUS: Record<string, string> = {
  open: 'До сплати',
  partially_paid: 'Частково',
  paid: 'Сплачено',
  overdue: 'Прострочено',
};

export default function ApartmentAccountPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    if (!id) return;
    apiFetch<Account>(`/accruals/apartments/${id}/account`, { token })
      .then(setAccount)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <main>
      <Link href="/admin/reports" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← {t('reports')}
      </Link>
      <PageHeader
        title={
          account
            ? `${t('apartmentAccount')} · кв. ${account.apartment.number}`
            : t('apartmentAccount')
        }
        description={
          account
            ? `${account.apartment.buildingName} · під'їзд ${account.apartment.entrance} · ${account.apartment.area} м²`
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
                setError('Не вдалося завантажити виписку');
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
            Експорт виписки Excel
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
            <StatCard label="Нараховано" value={formatMoney(account.summary.totalAccrued)} />
            <StatCard label="Аванс" value={formatMoney(account.summary.advance)} />
          </div>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Нарахування</h2>
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
                      <div style={{ fontWeight: 700 }}>{formatMoney(line.balance > 0 ? line.balance : line.amount)}</div>
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
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Платежі</h2>
            {account.payments.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Сума</th>
                      <th>Джерело</th>
                      <th>Референс</th>
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

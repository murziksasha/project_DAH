'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, getToken } from '@/lib/api';
import { setSelectedBuildingId } from '@/lib/building-context';
import { formatMoney } from '@/lib/money';

interface BuildingRow {
  buildingId: string;
  name: string;
  address: string;
  apartments: number;
  debt: number;
  openRequests: number;
  overdueRequests: number;
  collectionRate: number;
}

interface PortfolioResponse {
  buildings: BuildingRow[];
  totals: {
    debt: number;
    openRequests: number;
    overdueRequests: number;
    apartments: number;
    buildingCount: number;
  };
}

/** УК multi-building portfolio overview. */
export function PortfolioDashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<PortfolioResponse>('/building/portfolio', { token });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function openBuilding(id: string) {
    setSelectedBuildingId(id);
    window.location.href = '/admin/dispatch';
  }

  return (
    <main>
      <PageHeader
        title={t('portfolioTitle')}
        description={t('portfolioDesc')}
      />
      {error && <p className="error">{error}</p>}
      {loading && <SkeletonCards count={3} />}
      {!loading && data && (
        <>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <StatCard
              label={t('portfolioBuildings')}
              value={String(data.totals.buildingCount)}
            />
            <StatCard
              label={t('portfolioDebt')}
              value={formatMoney(data.totals.debt)}
              tone="danger"
            />
            <StatCard
              label={t('portfolioOpenReq')}
              value={String(data.totals.openRequests)}
              tone={data.totals.overdueRequests > 0 ? 'danger' : 'default'}
            />
            <StatCard
              label={t('portfolioApts')}
              value={String(data.totals.apartments)}
            />
          </div>

          <div className="quick-actions" style={{ marginBottom: '1rem' }}>
            <Link href="/admin/communications" className="quick-action">
              {t('portfolioBulkNews')}
            </Link>
            <Link href="/admin/dispatch" className="quick-action">
              {t('dashOpenQueue')}
            </Link>
            <Link href="/admin/reports" className="quick-action">
              {t('reports')}
            </Link>
          </div>

          <section className="card">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
              {t('portfolioByBuilding')}
            </h2>
            {data.buildings.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('building')}</th>
                      <th>{t('portfolioApts')}</th>
                      <th>{t('portfolioDebt')}</th>
                      <th>{t('portfolioCollection')}</th>
                      <th>{t('portfolioOpenReq')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.buildings.map((b) => (
                      <tr key={b.buildingId}>
                        <td>
                          <strong>{b.name}</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {b.address}
                          </div>
                        </td>
                        <td>{b.apartments}</td>
                        <td style={{ fontWeight: 600 }}>{formatMoney(b.debt)}</td>
                        <td>{b.collectionRate}%</td>
                        <td>
                          {b.openRequests}
                          {b.overdueRequests > 0 && (
                            <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                              {b.overdueRequests} SLA
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => openBuilding(b.buildingId)}
                          >
                            {t('portfolioOpen')}
                          </button>
                        </td>
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

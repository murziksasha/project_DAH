'use client';

import { useI18n } from '@/components/LocaleProvider';
import { formatMoney } from '@/lib/money';

interface Props {
  totalExpenses: number;
  totalIncome: number;
  netFlow: number;
  byCategory: Array<{ name: string; total: number }>;
  fundBalances: Array<{ fundName: string; balance: number }>;
}

/**
 * «Куди пішли гроші» — short narrative cards for resident trust.
 */
export function TransparencyStories({
  totalExpenses,
  totalIncome,
  netFlow,
  byCategory,
  fundBalances,
}: Props) {
  const { t } = useI18n();
  const topCats = [...byCategory].sort((a, b) => b.total - a.total).slice(0, 3);
  const topFunds = [...fundBalances].sort((a, b) => b.balance - a.balance).slice(0, 3);

  return (
    <section className="transparency-stories" aria-label={t('residentTabTransparency')}>
      <h2 className="resident-section-title" style={{ marginBottom: '0.75rem' }}>
        {t('residentMoneyStoryTitle')}
      </h2>
      <div className="transparency-story-grid">
        <article className="transparency-story-card">
          <div className="transparency-story-label">{t('residentMoneyIn')}</div>
          <div className="transparency-story-value" style={{ color: 'var(--success)' }}>
            {formatMoney(totalIncome)}
          </div>
          <p className="transparency-story-hint">{t('residentMoneyInHint')}</p>
        </article>
        <article className="transparency-story-card">
          <div className="transparency-story-label">{t('residentMoneyOut')}</div>
          <div className="transparency-story-value" style={{ color: 'var(--danger)' }}>
            {formatMoney(totalExpenses)}
          </div>
          <p className="transparency-story-hint">{t('residentMoneyOutHint')}</p>
        </article>
        <article className="transparency-story-card">
          <div className="transparency-story-label">{t('residentMoneyNet')}</div>
          <div
            className="transparency-story-value"
            style={{ color: netFlow >= 0 ? 'var(--success)' : 'var(--danger)' }}
          >
            {formatMoney(netFlow)}
          </div>
          <p className="transparency-story-hint">{t('residentMoneyNetHint')}</p>
        </article>
      </div>

      {topCats.length > 0 && (
        <div className="card" style={{ marginTop: '0.75rem', boxShadow: 'none' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
            {t('residentMoneyTopCats')}
          </h3>
          <ol className="transparency-rank-list">
            {topCats.map((c, i) => (
              <li key={c.name}>
                <span>
                  {i + 1}. {c.name}
                </span>
                <strong>{formatMoney(c.total)}</strong>
              </li>
            ))}
          </ol>
        </div>
      )}

      {topFunds.length > 0 && (
        <div className="card" style={{ marginTop: '0.75rem', boxShadow: 'none' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
            {t('residentMoneyFunds')}
          </h3>
          <ul className="transparency-rank-list" style={{ listStyle: 'none', padding: 0 }}>
            {topFunds.map((f) => (
              <li key={f.fundName}>
                <span>{f.fundName}</span>
                <strong>{formatMoney(f.balance)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

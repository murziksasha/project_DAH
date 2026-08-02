'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateUk, formatMoney } from '@/lib/money';
import type { AccountFiltersState, TimelineEventLike } from '../_lib/account-filters';
import { groupTimelineByPeriod } from '../_lib/account-filters';

interface Props {
  events: TimelineEventLike[];
  view: AccountFiltersState['view'];
  onResetFilters?: () => void;
}

const FEED_PAGE = 25;

export function AccountHistory({ events, view, onResetFilters }: Props) {
  const { t } = useI18n();
  const groups = useMemo(() => groupTimelineByPeriod(events), [events]);
  const currentYear = String(new Date().getFullYear());
  const [openYears, setOpenYears] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of groups) {
      init[g.year] = g.year === currentYear;
    }
    return init;
  });
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [feedLimit, setFeedLimit] = useState(FEED_PAGE);

  if (events.length === 0) {
    return (
      <div className="card">
        <EmptyState
          title={t('residentNoOpsPeriod')}
          description={t('residentNoOpsPeriodDesc')}
        />
        {onResetFilters && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: '0.5rem' }}
            onClick={onResetFilters}
          >
            {t('residentResetFilters')}
          </button>
        )}
      </div>
    );
  }

  if (view === 'feed') {
    const slice = events
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, feedLimit);
    return (
      <div className="card resident-history">
        <h2 className="resident-section-title">{t('residentHistoryFeed')}</h2>
        <ul className="resident-event-list">
          {slice.map((ev) => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </ul>
        {feedLimit < events.length && (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: '0.75rem' }}
            onClick={() => setFeedLimit((n) => n + FEED_PAGE)}
          >
            {t('residentShowMore', { count: events.length - feedLimit })}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card resident-history">
      <h2 className="resident-section-title">{t('residentHistory')}</h2>
      <div className="resident-year-list">
        {groups.map((g) => {
          const yearOpen = openYears[g.year] ?? g.year === currentYear;
          return (
            <div key={g.year} className="resident-year-block">
              <button
                type="button"
                className="resident-year-toggle"
                aria-expanded={yearOpen}
                onClick={() =>
                  setOpenYears((prev) => ({ ...prev, [g.year]: !yearOpen }))
                }
              >
                <span>
                  <strong>{g.year}</strong>
                  <span className="resident-muted">
                    {' '}
                    · {t('aptAccrued').toLowerCase()} {formatMoney(g.accrued)} ·{' '}
                    {t('paid').toLowerCase()} {formatMoney(g.paid)}
                  </span>
                </span>
                <span aria-hidden>{yearOpen ? '▾' : '▸'}</span>
              </button>
              {yearOpen &&
                g.months.map((m) => {
                  const mOpen = openMonths[m.period] ?? true;
                  return (
                    <div key={m.period} className="resident-month-block">
                      <button
                        type="button"
                        className="resident-month-toggle"
                        aria-expanded={mOpen}
                        onClick={() =>
                          setOpenMonths((prev) => ({
                            ...prev,
                            [m.period]: !mOpen,
                          }))
                        }
                      >
                        <span>
                          {m.label}
                          <span className="resident-muted">
                            {' '}
                            · {formatMoney(m.accrued)} / {formatMoney(m.paid)}
                          </span>
                        </span>
                        <span aria-hidden>{mOpen ? '▾' : '▸'}</span>
                      </button>
                      {mOpen && (
                        <ul className="resident-event-list">
                          {m.events.map((ev) => (
                            <EventRow key={ev.id} ev={ev} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({ ev }: { ev: TimelineEventLike }) {
  return (
    <li className="resident-event-row">
      <div>
        <Badge tone={ev.kind === 'payment' ? 'success' : 'primary'}>
          {ev.kind === 'payment' ? 'Платіж' : 'Нарахування'}
        </Badge>{' '}
        <strong>{ev.title}</strong>
        <div className="resident-muted resident-sm">{formatDateUk(ev.at)}</div>
      </div>
      <div
        className={`resident-event-amount${ev.kind === 'payment' ? ' is-payment' : ''}`}
      >
        {ev.kind === 'payment' ? '+' : ''}
        {formatMoney(ev.amount)}
      </div>
    </li>
  );
}

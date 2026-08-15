'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/StatCard';
import { formatDateUk, formatMoney } from '@/lib/money';
import { downloadXlsx } from '@/lib/xlsx';
import {
  collectYears,
  EMPTY_FILTERS,
  filterLabel,
  filterLines,
  filterTimeline,
  filteredSummary,
  type AccountFiltersState,
  type AccountLineLike,
  type TimelineEventLike,
} from '../_lib/account-filters';
import { AccountFilters } from './AccountFilters';
import { AccountHistory } from './AccountHistory';

export interface ResidentAccount {
  apartment: { number: string; buildingName: string };
  summary: {
    totalAccrued: number;
    totalPaid: number;
    debt: number;
    debtPrincipal?: number;
    debtPenalty?: number;
    advance: number;
  };
  lines: AccountLineLike[];
  payments: Array<{ id: string; amount: number; date: string; source: string }>;
  timeline?: TimelineEventLike[];
}

export interface BankAccountInfo {
  id: string;
  bankName: string;
  iban: string;
  description: string | null;
}

interface Props {
  account: ResidentAccount;
  bankAccounts?: BankAccountInfo[] | null;
  buildingEdrpou?: string | null;
  paymentPurpose: string;
  onReceipt: (lineId: string) => void;
  onPay?: () => void;
  copied: string;
  onCopy: (label: string, text: string) => void;
  /** Open full history/filters by default (e.g. deep link with year/month) */
  startExpanded?: boolean;
}

const FILTERS_KEY = 'dah_resident_account_filters';
const DETAILS_KEY = 'dah_resident_account_details';
const RECENT_LIMIT = 5;

export function AccountTab({
  account,
  bankAccounts,
  buildingEdrpou,
  paymentPurpose,
  onReceipt,
  onPay,
  copied,
  onCopy,
  startExpanded = false,
}: Props) {
  const { t } = useI18n();
  const STATUS_LABELS: Record<string, string> = {
    open: t('aptStatusOpen'),
    partially_paid: t('aptStatusPartial'),
    paid: t('aptStatusPaid'),
    overdue: t('aptStatusOverdue'),
  };
  const [filters, setFilters] = useState<AccountFiltersState>(EMPTY_FILTERS);
  const [detailsOpen, setDetailsOpen] = useState(startExpanded);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AccountFiltersState;
        setFilters({ ...EMPTY_FILTERS, ...parsed });
      }
      const params = new URLSearchParams(window.location.search);
      const year = params.get('year');
      const month = params.get('month');
      if (year || month) {
        setFilters((f) => ({
          ...f,
          year: year ?? f.year,
          month: month ?? f.month,
        }));
        setDetailsOpen(true);
      } else if (!startExpanded) {
        const pref = sessionStorage.getItem(DETAILS_KEY);
        if (pref === '1') setDetailsOpen(true);
        if (pref === '0') setDetailsOpen(false);
      }
    } catch {
      /* ignore */
    }
  }, [startExpanded]);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
      sessionStorage.setItem(DETAILS_KEY, detailsOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    if (filters.year) url.searchParams.set('year', filters.year);
    else url.searchParams.delete('year');
    if (filters.month) url.searchParams.set('month', filters.month);
    else url.searchParams.delete('month');
    if (!url.searchParams.get('tab')) url.searchParams.set('tab', 'account');
    window.history.replaceState({}, '', url.toString());
  }, [filters, detailsOpen]);

  const timeline = account.timeline ?? [];
  const years = useMemo(
    () => collectYears(account.lines, timeline),
    [account.lines, timeline],
  );

  const filteredLines = useMemo(
    () => filterLines(account.lines, filters),
    [account.lines, filters],
  );
  const filteredEvents = useMemo(
    () => filterTimeline(timeline, filters),
    [timeline, filters],
  );
  const periodSummary = useMemo(
    () => filteredSummary(filteredLines, filteredEvents),
    [filteredLines, filteredEvents],
  );

  const recentEvents = useMemo(() => {
    const source =
      timeline.length > 0
        ? timeline
        : [
            ...account.lines.map(
              (l): TimelineEventLike => ({
                id: `line-${l.id}`,
                kind: 'accrual',
                at: `${l.period}-01`,
                title: l.title,
                amount: l.amount,
              }),
            ),
            ...account.payments.map(
              (p): TimelineEventLike => ({
                id: `pay-${p.id}`,
                kind: 'payment',
                at: p.date,
                title: p.source || t('payments'),
                amount: p.amount,
              }),
            ),
          ];
    return source
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, RECENT_LIMIT);
  }, [timeline, account.lines, account.payments, t]);

  const openLines = useMemo(
    () => account.lines.filter((l) => l.balance > 0).slice(0, 3),
    [account.lines],
  );

  const currentPeriod = new Date().toISOString().slice(0, 7);
  const monthLines = useMemo(
    () => account.lines.filter((l) => l.period === currentPeriod),
    [account.lines, currentPeriod],
  );
  const monthReceiptLine = useMemo(() => {
    if (!monthLines.length) return null;
    return (
      monthLines.find((l) => l.balance > 0) ??
      monthLines[0] ??
      null
    );
  }, [monthLines]);

  async function exportExcel() {
    const stamp = new Date().toISOString().slice(0, 10);
    await downloadXlsx(`vypyska-kv-${account.apartment.number}-${stamp}.xlsx`, [
      {
        name: 'Підсумок',
        rows: [
          ['Квартира', account.apartment.number],
          ['Будинок', account.apartment.buildingName],
          ['Фільтр', filterLabel(filters)],
          [],
          ['Борг (загальний)', account.summary.debt],
          ['Аванс', account.summary.advance],
          ['Нараховано (усі)', account.summary.totalAccrued],
          ['Сплачено (усі)', account.summary.totalPaid],
          [],
          ['Борг (фільтр)', periodSummary.debt],
          ['Нараховано (фільтр)', periodSummary.accrued],
          ['Платежі (фільтр)', periodSummary.paidEvents],
        ],
      },
      {
        name: 'Історія',
        rows: [
          ['Тип', 'Дата', 'Опис', 'Сума'],
          ...filteredEvents.map((e) => [
            e.kind === 'payment' ? 'Платіж' : 'Нарахування',
            e.at.slice(0, 10),
            e.title,
            e.amount,
          ]),
        ],
      },
      {
        name: 'Нарахування',
        rows: [
          ['Період', 'Послуга', 'Фонд', 'Сума', 'Сплачено', 'Залишок', 'Статус'],
          ...filteredLines.map((l) => [
            l.period,
            l.title,
            l.fundName,
            l.amount,
            l.paidAmount,
            l.balance,
            STATUS_LABELS[l.status] ?? l.status,
          ]),
        ],
      },
    ]);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const primaryBank = bankAccounts?.[0] ?? null;

  return (
    <section className="resident-account">
      {/* Compact primary summary — no filter noise */}
      <div className="resident-summary-sticky resident-account-compact">
        <div className="grid-2 resident-stat-grid resident-stat-grid-compact">
          <StatCard
            label={t('debt')}
            value={formatMoney(account.summary.debt)}
            tone={account.summary.debt > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label={
              account.summary.advance > 0 ? t('aptAdvance') : t('paid')
            }
            value={formatMoney(
              account.summary.advance > 0
                ? account.summary.advance
                : account.summary.totalPaid,
            )}
            tone={account.summary.advance > 0 ? 'success' : 'muted'}
          />
        </div>
        {(account.summary.debtPenalty ?? 0) > 0 && (
          <p className="resident-muted resident-sm" style={{ marginTop: '0.5rem' }}>
            Внески: {formatMoney(account.summary.debtPrincipal ?? 0)} · Пеня:{' '}
            {formatMoney(account.summary.debtPenalty ?? 0)}
          </p>
        )}
        <div className="resident-account-cta-row">
          {account.summary.debt > 0 && onPay && (
            <button type="button" className="btn resident-account-pay-btn" onClick={onPay}>
              {t('residentPayCta', { amount: formatMoney(account.summary.debt) })}
            </button>
          )}
          {monthReceiptLine && (
            <button
              type="button"
              className="btn btn-ghost resident-account-pay-btn"
              onClick={() => onReceipt(monthReceiptLine.id)}
            >
              {t('residentMonthReceipt', { period: currentPeriod })}
            </button>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card resident-recent">
        <h2 className="resident-section-title">{t('residentRecentOps')}</h2>
        {recentEvents.length === 0 ? (
          <p className="resident-muted">{t('residentNoHistory')}</p>
        ) : (
          <ul className="resident-event-list">
            {recentEvents.map((ev) => (
              <li key={ev.id} className="resident-event-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{ev.title}</div>
                  <div className="resident-muted resident-sm">{formatDateUk(ev.at)}</div>
                </div>
                <div
                  className={`resident-event-amount${ev.kind === 'payment' ? ' is-payment' : ''}`}
                >
                  {ev.kind === 'payment' ? '−' : '+'}
                  {formatMoney(Math.abs(ev.amount))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Open accruals with PDF */}
      {openLines.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 className="resident-section-title">{t('residentOpenAccruals')}</h2>
          <ul className="resident-lines-list">
            {openLines.map((line) => (
              <li key={line.id} className="resident-line-card">
                <div className="resident-line-main">
                  <div style={{ fontWeight: 600 }}>{line.title}</div>
                  <div className="resident-line-meta">
                    <span>{line.period}</span>
                    <Badge tone={line.status === 'overdue' ? 'danger' : 'muted'}>
                      {STATUS_LABELS[line.status] ?? line.status}
                    </Badge>
                  </div>
                </div>
                <div className="resident-line-actions">
                  <div style={{ fontWeight: 700 }}>{formatMoney(line.balance)}</div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onReceipt(line.id)}
                  >
                    PDF
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compact bank details */}
      {primaryBank && (
        <div className="card" id="bank-details" style={{ marginTop: '1rem' }}>
          <h2 className="resident-section-title">{t('residentBankDetails')}</h2>
          <p className="resident-muted" style={{ marginBottom: '0.5rem' }}>
            {primaryBank.bankName} · IBAN {primaryBank.iban}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onCopy('iban', primaryBank.iban)}
            >
              {copied === 'iban' ? t('residentCopied') : t('residentCopyIban')}
            </button>
            {onPay && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={onPay}>
                {t('residentPayTitle')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progressive disclosure: full history / filters / excel */}
      <div className="resident-details-toggle" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', minHeight: 48 }}
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
        >
          {detailsOpen ? t('residentHideDetails') : t('residentShowDetails')}
        </button>
      </div>

      {detailsOpen && (
        <div className="resident-account-details">
          <div className="resident-summary-sticky" style={{ marginTop: '0.75rem' }}>
            <div className="grid-2 resident-stat-grid">
              <StatCard label={t('aptAccrued')} value={formatMoney(account.summary.totalAccrued)} />
              <StatCard
                label={t('paid')}
                value={formatMoney(account.summary.totalPaid)}
                tone="success"
              />
            </div>
            <p className="resident-filter-hint">
              {t('filter')}: <strong>{filterLabel(filters)}</strong>
              {' · '}
              {t('debt')} {formatMoney(periodSummary.debt)}
              {' · '}
              {t('aptPayments')} {formatMoney(periodSummary.paidEvents)}
            </p>
          </div>

          <AccountFilters
            value={filters}
            years={years}
            onChange={setFilters}
            onReset={resetFilters}
          />

          <div className="resident-toolbar">
            <button type="button" className="btn btn-sm" onClick={() => void exportExcel()}>
              {t('aptStatement')}
            </button>
          </div>

          <AccountHistory
            events={filteredEvents}
            view={filters.view}
            onResetFilters={resetFilters}
          />

          {bankAccounts && bankAccounts.length > 1 && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h2 className="resident-section-title">{t('residentAllBankAccounts')}</h2>
              {bankAccounts.map((b) => (
                <div key={b.id} style={{ marginBottom: '1rem' }}>
                  <dl className="bank-details">
                    <dt>{t('residentBankName')}</dt>
                    <dd>{b.bankName}</dd>
                    <dt>IBAN</dt>
                    <dd>
                      {b.iban}{' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => onCopy('iban', b.iban)}
                      >
                        {copied === 'iban' ? t('residentCopied') : t('residentCopy')}
                      </button>
                    </dd>
                    {buildingEdrpou && (
                      <>
                        <dt>{t('residentEdrpou')}</dt>
                        <dd>{buildingEdrpou}</dd>
                      </>
                    )}
                    <dt>{t('residentPaymentPurpose')}</dt>
                    <dd>
                      {paymentPurpose}{' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => onCopy('purpose', paymentPurpose)}
                      >
                        {copied === 'purpose' ? t('residentCopied') : t('residentCopy')}
                      </button>
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ marginTop: '1rem' }}>
            <h2 className="resident-section-title">
              {t('residentAllAccruals')} ({filteredLines.length})
            </h2>
            {filteredLines.length === 0 ? (
              <EmptyState
                title={t('residentNoAccruals')}
                description={
                  account.lines.length === 0
                    ? t('residentNoAccrualsDesc')
                    : t('residentNoOpsPeriodDesc')
                }
              />
            ) : (
              <ul className="resident-lines-list">
                {filteredLines.map((line) => (
                  <li key={line.id} className="resident-line-card">
                    <div className="resident-line-main">
                      <div style={{ fontWeight: 600 }}>{line.title}</div>
                      <div className="resident-line-meta">
                        <span>{line.period}</span>
                        <span>{line.fundName}</span>
                        <Badge
                          tone={
                            line.status === 'paid'
                              ? 'success'
                              : line.status === 'overdue'
                                ? 'danger'
                                : 'muted'
                          }
                        >
                          {STATUS_LABELS[line.status] ?? line.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="resident-line-actions">
                      <div style={{ fontWeight: 700 }}>
                        {formatMoney(line.balance > 0 ? line.balance : line.amount)}
                      </div>
                      {line.balance > 0 && line.balance !== line.amount && (
                        <div className="resident-muted resident-sm">
                          з {formatMoney(line.amount)}
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => onReceipt(line.id)}
                      >
                        PDF
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

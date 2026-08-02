'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatCard } from '@/components/ui/StatCard';
import { formatMoney } from '@/lib/money';
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

const STATUS_LABELS: Record<string, string> = {
  open: 'До сплати',
  partially_paid: 'Частково',
  paid: 'Сплачено',
  overdue: 'Прострочено',
};

export interface ResidentAccount {
  apartment: { number: string; buildingName: string };
  summary: { totalAccrued: number; totalPaid: number; debt: number; advance: number };
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
  copied: string;
  onCopy: (label: string, text: string) => void;
}

const FILTERS_KEY = 'dah_resident_account_filters';

export function AccountTab({
  account,
  bankAccounts,
  buildingEdrpou,
  paymentPurpose,
  onReceipt,
  copied,
  onCopy,
}: Props) {
  const [filters, setFilters] = useState<AccountFiltersState>(EMPTY_FILTERS);

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
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    if (filters.year) url.searchParams.set('year', filters.year);
    else url.searchParams.delete('year');
    if (filters.month) url.searchParams.set('month', filters.month);
    else url.searchParams.delete('month');
    window.history.replaceState({}, '', url.toString());
  }, [filters]);

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

  return (
    <section className="resident-account">
      <div className="resident-summary-sticky">
        <div className="grid-2 resident-stat-grid">
          <StatCard
            label="Борг"
            value={formatMoney(account.summary.debt)}
            tone={account.summary.debt > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label="Аванс"
            value={formatMoney(account.summary.advance)}
            tone={account.summary.advance > 0 ? 'success' : 'muted'}
          />
          <StatCard label="Нараховано" value={formatMoney(account.summary.totalAccrued)} />
          <StatCard label="Сплачено" value={formatMoney(account.summary.totalPaid)} tone="success" />
        </div>
        <p className="resident-filter-hint">
          Показано: <strong>{filterLabel(filters)}</strong>
          {' · '}
          борг у вибірці {formatMoney(periodSummary.debt)}
          {' · '}
          платежі {formatMoney(periodSummary.paidEvents)}
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
          Excel: виписка
        </button>
      </div>

      <AccountHistory
        events={filteredEvents}
        view={filters.view}
        onResetFilters={resetFilters}
      />

      {bankAccounts && bankAccounts.length > 0 && (
        <div className="card" id="bank-details" style={{ marginTop: '1rem' }}>
          <h2 className="resident-section-title">Реквізити для оплати</h2>
          <p className="resident-muted" style={{ marginBottom: '0.75rem' }}>
            Сплатіть внесок за реквізитами організації. У призначенні платежу вкажіть квартиру.
          </p>
          {bankAccounts.map((b) => (
            <div key={b.id} style={{ marginBottom: '1rem' }}>
              <dl className="bank-details">
                <dt>Банк</dt>
                <dd>{b.bankName}</dd>
                <dt>IBAN</dt>
                <dd>
                  {b.iban}{' '}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onCopy('iban', b.iban)}
                  >
                    {copied === 'iban' ? 'Скопійовано' : 'Копіювати'}
                  </button>
                </dd>
                {b.description && (
                  <>
                    <dt>Опис</dt>
                    <dd style={{ fontFamily: 'inherit', fontWeight: 500 }}>{b.description}</dd>
                  </>
                )}
                {buildingEdrpou && (
                  <>
                    <dt>ЄДРПОУ</dt>
                    <dd>{buildingEdrpou}</dd>
                  </>
                )}
                <dt>Призначення платежу</dt>
                <dd>
                  {paymentPurpose}{' '}
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onCopy('purpose', paymentPurpose)}
                  >
                    {copied === 'purpose' ? 'Скопійовано' : 'Копіювати'}
                  </button>
                </dd>
              </dl>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        <h2 className="resident-section-title">
          Нарахування ({filteredLines.length})
        </h2>
        {filteredLines.length === 0 ? (
          <EmptyState
            title="Немає нарахувань"
            description={
              account.lines.length === 0
                ? 'Коли правління згенерує внески, вони з’являться тут.'
                : 'Немає рядків за поточними фільтрами.'
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
    </section>
  );
}

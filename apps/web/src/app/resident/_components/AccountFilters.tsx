'use client';

import { useI18n } from '@/components/LocaleProvider';
import type { AccountFiltersState } from '../_lib/account-filters';
import { monthLabel } from '../_lib/account-filters';

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

interface Props {
  value: AccountFiltersState;
  years: string[];
  onChange: (next: AccountFiltersState) => void;
  onReset: () => void;
}

export function AccountFilters({ value, years, onChange, onReset }: Props) {
  const { t } = useI18n();
  function patch(p: Partial<AccountFiltersState>) {
    onChange({ ...value, ...p });
  }

  return (
    <div className="resident-filters card">
      <div className="resident-filters-grid">
        <div>
          <label htmlFor="acc-year">{t('residentYear')}</label>
          <select
            id="acc-year"
            value={value.year}
            onChange={(e) =>
              patch({ year: e.target.value, month: e.target.value ? value.month : '' })
            }
          >
            <option value="">{t('residentAllYears')}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="acc-month">{t('residentMonth')}</label>
          <select
            id="acc-month"
            value={value.month}
            disabled={!value.year}
            onChange={(e) => patch({ month: e.target.value })}
          >
            <option value="">{t('residentAllMonths')}</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="acc-kind">{t('residentType')}</label>
          <select
            id="acc-kind"
            value={value.kind}
            onChange={(e) =>
              patch({ kind: e.target.value as AccountFiltersState['kind'] })
            }
          >
            <option value="">{t('all')}</option>
            <option value="accrual">{t('aptAccruals')}</option>
            <option value="payment">{t('aptPayments')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="acc-status">{t('status')}</label>
          <select
            id="acc-status"
            value={value.status}
            onChange={(e) => patch({ status: e.target.value })}
          >
            <option value="">{t('all')}</option>
            <option value="open">{t('aptStatusOpen')}</option>
            <option value="partially_paid">{t('aptStatusPartial')}</option>
            <option value="overdue">{t('overdue')}</option>
            <option value="paid">{t('paid')}</option>
          </select>
        </div>
        <div className="resident-filters-search">
          <label htmlFor="acc-q">{t('searchPlaceholder')}</label>
          <input
            id="acc-q"
            type="search"
            placeholder={t('searchPlaceholder')}
            value={value.q}
            onChange={(e) => patch({ q: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="acc-view">{t('residentType')}</label>
          <select
            id="acc-view"
            value={value.view}
            onChange={(e) =>
              patch({ view: e.target.value as AccountFiltersState['view'] })
            }
          >
            <option value="periods">{t('period')}</option>
            <option value="feed">{t('residentHistoryFeed')}</option>
          </select>
        </div>
      </div>
      <div className="resident-filters-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onReset}>
          {t('residentResetFilters')}
        </button>
      </div>
    </div>
  );
}

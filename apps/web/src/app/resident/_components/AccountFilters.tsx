'use client';

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
  function patch(p: Partial<AccountFiltersState>) {
    onChange({ ...value, ...p });
  }

  return (
    <div className="resident-filters card">
      <div className="resident-filters-grid">
        <div>
          <label htmlFor="acc-year">Рік</label>
          <select
            id="acc-year"
            value={value.year}
            onChange={(e) =>
              patch({ year: e.target.value, month: e.target.value ? value.month : '' })
            }
          >
            <option value="">Усі роки</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="acc-month">Місяць</label>
          <select
            id="acc-month"
            value={value.month}
            disabled={!value.year}
            onChange={(e) => patch({ month: e.target.value })}
          >
            <option value="">Усі місяці</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="acc-kind">Тип</label>
          <select
            id="acc-kind"
            value={value.kind}
            onChange={(e) =>
              patch({ kind: e.target.value as AccountFiltersState['kind'] })
            }
          >
            <option value="">Усі</option>
            <option value="accrual">Нарахування</option>
            <option value="payment">Платежі</option>
          </select>
        </div>
        <div>
          <label htmlFor="acc-status">Статус</label>
          <select
            id="acc-status"
            value={value.status}
            onChange={(e) => patch({ status: e.target.value })}
          >
            <option value="">Усі</option>
            <option value="open">До сплати</option>
            <option value="partially_paid">Частково</option>
            <option value="overdue">Прострочено</option>
            <option value="paid">Сплачено</option>
          </select>
        </div>
        <div className="resident-filters-search">
          <label htmlFor="acc-q">Пошук</label>
          <input
            id="acc-q"
            type="search"
            placeholder="Послуга, фонд, період…"
            value={value.q}
            onChange={(e) => patch({ q: e.target.value })}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="acc-view">Вигляд</label>
          <select
            id="acc-view"
            value={value.view}
            onChange={(e) =>
              patch({ view: e.target.value as AccountFiltersState['view'] })
            }
          >
            <option value="periods">За періодами</option>
            <option value="feed">Стрічка</option>
          </select>
        </div>
      </div>
      <div className="resident-filters-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onReset}>
          Скинути фільтри
        </button>
      </div>
    </div>
  );
}

'use client';

import { useI18n } from '@/components/LocaleProvider';
import { formatDateUk } from '@/lib/money';
import {
  EDIT_ROLES,
  getRoleLabel,
  getStatusLabel,
  PAGE_SIZE,
  STATUS_COLORS,
} from './constants';
import { UserRow, UserSortField } from './types';

// filterRoles can be overridden via filterRoleOptions

function formatApartments(
  user: UserRow,
  aptShort: (number: string) => string,
) {
  const apts = user.apartments ?? [];
  if (!apts.length && user.apartment) {
    return aptShort(user.apartment.number);
  }
  return (
    apts
      .map((a) => {
        const label = aptShort(a.number);
        return a.isPrimary ? `${label} ★` : label;
      })
      .join(', ') || '—'
  );
}

function formatApprovedWhen(value: string, locale: string) {
  const d = new Date(value);
  const timeLocale = locale === 'ru' ? 'ru-RU' : 'uk-UA';
  if (Number.isNaN(d.getTime())) return formatDateUk(value);
  return `${formatDateUk(d)} ${d.toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' })}`;
}

function formatApprovedBy(user: UserRow, locale: string) {
  if (!user.approvedBy && !user.approvedAt) return null;
  const who = user.approvedBy
    ? `${user.approvedBy.firstName} ${user.approvedBy.lastName}`.trim() || user.approvedBy.email
    : null;
  const when = user.approvedAt ? formatApprovedWhen(user.approvedAt, locale) : null;
  if (who && when) return `${who} · ${when}`;
  if (who) return who;
  if (when) return when;
  return null;
}

interface UsersSectionProps {
  users: UserRow[];
  total: number;
  page: number;
  search: string;
  roleFilter: string;
  statusFilter: string;
  sortBy: UserSortField;
  sortDir: 'asc' | 'desc';
  loading: boolean;
  tenantReady: boolean;
  onSearchChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSortChange: (field: UserSortField) => void;
  onPageChange: (page: number) => void;
  onEdit: (user: UserRow) => void;
  onToggleBlock: (user: UserRow) => void;
  /** Role codes for filter dropdown (defaults to EDIT_ROLES) */
  filterRoleOptions?: string[];
}

function SortHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: UserSortField;
  sortBy: UserSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: UserSortField) => void;
}) {
  const active = sortBy === field;
  return (
    <th style={{ padding: '0.35rem 0.5rem' }}>
      <button
        type="button"
        onClick={() => onSort(field)}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: 0,
          font: 'inherit',
          fontWeight: active ? 600 : 400,
        }}
        title={label}
      >
        {label}
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

export function UsersSection({
  users,
  total,
  page,
  search,
  roleFilter,
  statusFilter,
  sortBy,
  sortDir,
  loading,
  tenantReady,
  onSearchChange,
  onRoleFilterChange,
  onStatusFilterChange,
  onSortChange,
  onPageChange,
  onEdit,
  onToggleBlock,
  filterRoleOptions,
}: UsersSectionProps) {
  const { t, locale } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const aptShort = (number: string) => t('orgAptShort', { number });

  const filterRoles =
    filterRoleOptions && filterRoleOptions.length
      ? filterRoleOptions
      : EDIT_ROLES.filter((r) => r !== 'super_admin' as never);

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0 }}>{t('orgUsers')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: '1 1 320px', justifyContent: 'flex-end' }}>
          <input
            placeholder={t('orgUserSearchPh')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            disabled={!tenantReady}
            style={{ maxWidth: 260, flex: '1 1 160px' }}
          />
          <select
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value)}
            disabled={!tenantReady}
            aria-label={t('orgFilterRole')}
            style={{ maxWidth: 180 }}
          >
            <option value="">{t('orgFilterAllRoles')}</option>
            {filterRoles.map((r) => (
              <option key={r} value={r}>
                {getRoleLabel(r, t)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            disabled={!tenantReady}
            aria-label={t('orgFilterStatus')}
            style={{ maxWidth: 150 }}
          >
            <option value="">{t('orgFilterAllStatuses')}</option>
            <option value="active">{getStatusLabel('active', t)}</option>
            <option value="pending">{getStatusLabel('pending', t)}</option>
            <option value="blocked">{getStatusLabel('blocked', t)}</option>
          </select>
        </div>
      </div>

      {!tenantReady && (
        <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>{t('orgSelectTenantHint')}</p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.9rem', minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <SortHeader label={t('firstName')} field="name" sortBy={sortBy} sortDir={sortDir} onSort={onSortChange} />
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('phone')}</th>
              <SortHeader label={t('email')} field="email" sortBy={sortBy} sortDir={sortDir} onSort={onSortChange} />
              <SortHeader label={t('orgRole')} field="role" sortBy={sortBy} sortDir={sortDir} onSort={onSortChange} />
              <SortHeader label={t('orgStatus')} field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSortChange} />
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgApartments')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgApprovedBy')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {!tenantReady && (
              <tr>
                <td colSpan={8} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  {t('orgSelectTenantHint')}
                </td>
              </tr>
            )}
            {tenantReady && loading && (
              <tr>
                <td colSpan={8} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  {t('loading')}
                </td>
              </tr>
            )}
            {tenantReady && !loading && users.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  {t('orgUsersNotFound')}
                </td>
              </tr>
            )}
            {tenantReady &&
              !loading &&
              users.map((u) => (
                <tr key={`${u.id}:${u.role}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {u.firstName} {u.lastName}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{u.phone || '—'}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{u.email}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{getRoleLabel(u.role, t)}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>
                    <span style={{ color: STATUS_COLORS[u.status] ?? 'inherit', fontWeight: 500 }}>
                      {getStatusLabel(u.status, t)}
                    </span>
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}>
                    {formatApartments(u, aptShort)}
                  </td>
                  <td
                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', color: 'var(--muted)', maxWidth: 180 }}
                    title={
                      u.approvedBy
                        ? `${u.approvedBy.firstName} ${u.approvedBy.lastName} <${u.approvedBy.email}>`
                        : undefined
                    }
                  >
                    {formatApprovedBy(u, locale) ?? '—'}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {u.role !== 'super_admin' && (
                      <>
                        <button type="button" onClick={() => onEdit(u)} style={{ fontSize: '0.8rem', marginRight: '0.35rem' }}>
                          {t('edit')}
                        </button>
                        {u.status === 'blocked' ? (
                          <button type="button" onClick={() => onToggleBlock(u)} style={{ fontSize: '0.8rem' }}>
                            {t('orgUnblockShort')}
                          </button>
                        ) : (
                          <button type="button" onClick={() => onToggleBlock(u)} style={{ fontSize: '0.8rem' }}>
                            {t('orgBlockShort')}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {tenantReady && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '1rem',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          <span>{t('orgUsersPage', { page, pages: totalPages, total })}</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              ←
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

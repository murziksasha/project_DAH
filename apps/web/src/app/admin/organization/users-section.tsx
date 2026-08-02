'use client';

import { useI18n } from '@/components/LocaleProvider';
import { formatDateUk } from '@/lib/money';
import { getRoleLabel, getStatusLabel, PAGE_SIZE, STATUS_COLORS } from './constants';
import { UserRow } from './types';

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
  loading: boolean;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onEdit: (user: UserRow) => void;
  onToggleBlock: (user: UserRow) => void;
}

export function UsersSection({
  users,
  total,
  page,
  search,
  loading,
  onSearchChange,
  onPageChange,
  onEdit,
  onToggleBlock,
}: UsersSectionProps) {
  const { t, locale } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const aptShort = (number: string) => t('orgAptShort', { number });

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{t('orgUsers')}</h2>
        <input
          placeholder={t('orgUserSearchPh')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ maxWidth: 280, flex: '1 1 200px' }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.9rem', minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('firstName')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('phone')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('email')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgRole')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgStatus')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgApartments')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgApprovedBy')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  {t('loading')}
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  {t('orgUsersNotFound')}
                </td>
              </tr>
            )}
            {!loading &&
              users.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        <span>
          {t('orgUsersPage', { page, pages: totalPages, total })}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            ←
          </button>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            →
          </button>
        </div>
      </div>
    </section>
  );
}

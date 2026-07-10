'use client';

import { PAGE_SIZE, ROLE_LABELS, STATUS_COLORS, STATUS_LABELS } from './constants';
import { UserRow } from './types';

function formatApartments(user: UserRow) {
  const apts = user.apartments ?? [];
  if (!apts.length && user.apartment) {
    return `кв. ${user.apartment.number}`;
  }
  return apts
    .map((a) => {
      const label = `кв. ${a.number}`;
      return a.isPrimary ? `${label} ★` : label;
    })
    .join(', ') || '—';
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Користувачі</h2>
        <input
          placeholder="Пошук (ім'я, email, телефон)…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ maxWidth: 280, flex: '1 1 200px' }}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.9rem', minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '0.35rem 0.5rem' }}>Ім&apos;я</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>Телефон</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>Email</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>Роль</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>Статус</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>Квартири</th>
              <th style={{ padding: '0.35rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  Завантаження…
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  Користувачів не знайдено
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
                  <td style={{ padding: '0.35rem 0.5rem' }}>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>
                    <span style={{ color: STATUS_COLORS[u.status] ?? 'inherit', fontWeight: 500 }}>
                      {STATUS_LABELS[u.status] ?? u.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}>{formatApartments(u)}</td>
                  <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {u.role !== 'super_admin' && (
                      <>
                        <button type="button" onClick={() => onEdit(u)} style={{ fontSize: '0.8rem', marginRight: '0.35rem' }}>
                          Редагувати
                        </button>
                        {u.status === 'blocked' ? (
                          <button type="button" onClick={() => onToggleBlock(u)} style={{ fontSize: '0.8rem' }}>
                            Розблок
                          </button>
                        ) : (
                          <button type="button" onClick={() => onToggleBlock(u)} style={{ fontSize: '0.8rem' }}>
                            Блок
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
          Сторінка {page} з {totalPages} ({total} користувачів)
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
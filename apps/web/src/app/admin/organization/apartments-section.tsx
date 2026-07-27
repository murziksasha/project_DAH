'use client';

import { FormEvent, Fragment, useMemo, useState } from 'react';
import { STATUS_LABELS } from './constants';
import { ApartmentRow, UserRow } from './types';

interface ApartmentFormState {
  number: string;
  entrance: string;
  floor: string;
  area: string;
}

const emptyAptForm = (): ApartmentFormState => ({
  number: '',
  entrance: '1',
  floor: '',
  area: '',
});

function formatUser(u: { firstName: string; lastName: string; email: string }) {
  return `${u.firstName} ${u.lastName} (${u.email})`;
}

interface ApartmentsSectionProps {
  apartments: ApartmentRow[];
  allUsers: UserRow[];
  saving: boolean;
  onCreate: (data: { number: string; entrance: number; floor?: number; area: number }) => Promise<void>;
  onUpdate: (
    id: string,
    data: { number: string; entrance: number; floor?: number; area: number },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLinkUser: (apartmentId: string, userId: string) => Promise<void>;
  onUnlinkUser: (apartmentId: string, userId: string) => Promise<void>;
  onEditUser: (user: UserRow) => void;
  onExportCsv?: () => void;
  onImportCsv?: (csv: string) => Promise<void>;
}

export function ApartmentsSection({
  apartments,
  allUsers,
  saving,
  onCreate,
  onUpdate,
  onDelete,
  onLinkUser,
  onUnlinkUser,
  onEditUser,
  onExportCsv,
  onImportCsv,
}: ApartmentsSectionProps) {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyAptForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkUserId, setLinkUserId] = useState('');
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter(
      (a) =>
        a.number.toLowerCase().includes(q) ||
        String(a.entrance).includes(q) ||
        String(a.floor ?? '').includes(q),
    );
  }, [apartments, search]);

  const linkableUsers = useMemo(() => {
    if (!expandedId) return [];
    const linked = new Set((apartments.find((a) => a.id === expandedId)?.users ?? []).map((u) => u.id));
    return allUsers.filter((u) => u.role === 'resident' && !linked.has(u.id));
  }, [allUsers, apartments, expandedId]);

  function startEdit(a: ApartmentRow) {
    setEditingId(a.id);
    setForm({
      number: a.number,
      entrance: String(a.entrance),
      floor: a.floor != null ? String(a.floor) : '',
      area: String(a.area),
    });
    setExpandedId(a.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyAptForm());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      number: form.number,
      entrance: Number(form.entrance) || 1,
      floor: form.floor ? Number(form.floor) : undefined,
      area: Number(form.area),
    };
    if (editingId) {
      await onUpdate(editingId, payload);
      cancelEdit();
    } else {
      await onCreate(payload);
      setForm(emptyAptForm());
    }
  }

  async function handleDelete(id: string, number: string) {
    if (!confirm(`Видалити квартиру ${number}?`)) return;
    await onDelete(id);
    if (expandedId === id) setExpandedId(null);
    if (editingId === id) cancelEdit();
  }

  async function handleLink() {
    if (!expandedId || !linkUserId) return;
    await onLinkUser(expandedId, linkUserId);
    setLinkUserId('');
  }

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Квартири ({apartments.length})</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {onExportCsv && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onExportCsv}>
            CSV ↓
          </button>
        )}
        {onImportCsv && (
          <label className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }}>
            {importing ? 'Імпорт…' : 'CSV ↑'}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              disabled={importing || saving}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file || !onImportCsv) return;
                setImporting(true);
                try {
                  const text = await file.text();
                  await onImportCsv(text);
                } finally {
                  setImporting(false);
                }
              }}
            />
          </label>
        )}
        <input
          placeholder="Пошук квартири…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        </div>
      </div>
      {onImportCsv && (
        <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Імпорт CSV: <code>number,entrance,floor,area</code> (рядок заголовка опційний)
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr)) auto auto',
          gap: '0.5rem',
          marginBottom: '1rem',
          alignItems: 'end',
        }}
      >
        <input placeholder="№" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required />
        <input placeholder="Під'їзд" value={form.entrance} onChange={(e) => setForm({ ...form, entrance: e.target.value })} />
        <input placeholder="Поверх" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
        <input placeholder="Площа" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} required />
        <button type="submit" disabled={saving}>
          {editingId ? 'Зберегти' : '+'}
        </button>
        {editingId && (
          <button type="button" onClick={cancelEdit}>
            Скасувати
          </button>
        )}
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.9rem', minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th>№</th>
              <th>Під&apos;їзд</th>
              <th>Поверх</th>
              <th>Площа</th>
              <th>Мешканці</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <Fragment key={a.id}>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{a.number}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{a.entrance}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{a.floor ?? '—'}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{a.area} м²</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{a.users?.length ?? 0}</td>
                  <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      style={{ fontSize: '0.8rem', marginRight: '0.35rem' }}
                      onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                    >
                      Деталі
                    </button>
                    <button type="button" style={{ fontSize: '0.8rem', marginRight: '0.35rem' }} onClick={() => startEdit(a)}>
                      Редагувати
                    </button>
                    <button type="button" style={{ fontSize: '0.8rem' }} onClick={() => handleDelete(a.id, a.number)}>
                      Видалити
                    </button>
                  </td>
                </tr>
                {expandedId === a.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '0.75rem 0.5rem', background: 'var(--bg-subtle, rgba(0,0,0,0.03))' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                        Прив&apos;язані облікові записи
                      </div>
                      {(a.users ?? []).length === 0 && (
                        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>Немає прив&apos;язаних мешканців</p>
                      )}
                      <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                        {(a.users ?? []).map((u) => {
                          const full = allUsers.find((x) => x.id === u.id);
                          return (
                            <li key={u.id} style={{ marginBottom: '0.25rem' }}>
                              {formatUser(u)}
                              {u.isPrimary && ' ★'}
                              {' · '}
                              {STATUS_LABELS[u.status] ?? u.status}
                              {' '}
                              <button
                                type="button"
                                style={{ fontSize: '0.75rem' }}
                                onClick={() => full && onEditUser(full)}
                              >
                                Редагувати
                              </button>
                              {' '}
                              <button
                                type="button"
                                style={{ fontSize: '0.75rem' }}
                                onClick={() => onUnlinkUser(a.id, u.id)}
                              >
                                Відв&apos;язати
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      {linkableUsers.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <select value={linkUserId} onChange={(e) => setLinkUserId(e.target.value)} style={{ minWidth: 220 }}>
                            <option value="">Оберіть мешканця…</option>
                            {linkableUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {formatUser(u)}
                              </option>
                            ))}
                          </select>
                          <button type="button" disabled={!linkUserId} onClick={handleLink}>
                            Прив&apos;язати
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
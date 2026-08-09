'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { CREATE_ROLES, getRoleLabel } from './constants';
import { ApartmentRow, UserFormState, UserRow } from './types';

interface UserFormProps {
  form: UserFormState;
  editingUser: UserRow | null;
  apartments: ApartmentRow[];
  saving: boolean;
  /** Active (and current) role codes for dropdown; falls back to CREATE_ROLES */
  roleOptions?: string[];
  /** When editing a non-resident membership that does not yet have a resident persona */
  canAddResidentRole?: boolean;
  onAddResidentRole?: () => void;
  onChange: (form: UserFormState) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}

function matchesApartmentSearch(a: ApartmentRow, q: string) {
  if (!q) return true;
  return (
    a.number.toLowerCase().includes(q) ||
    String(a.entrance).includes(q) ||
    String(a.floor ?? '').includes(q)
  );
}

export function UserForm({
  form,
  editingUser,
  apartments,
  saving,
  roleOptions,
  canAddResidentRole,
  onAddResidentRole,
  onChange,
  onSubmit,
  onCancel,
}: UserFormProps) {
  const { t } = useI18n();
  const [aptSearch, setAptSearch] = useState('');
  const isEdit = !!editingUser;
  const showApartments = form.role === 'resident';
  const roles =
    roleOptions && roleOptions.length
      ? roleOptions
      : [...CREATE_ROLES];
  // Keep current role visible when editing even if deactivated
  if (isEdit && editingUser && !roles.includes(editingUser.role)) {
    roles.push(editingUser.role);
  }

  const q = aptSearch.trim().toLowerCase();
  const selectedApartments = useMemo(
    () => apartments.filter((a) => form.apartmentIds.includes(a.id)),
    [apartments, form.apartmentIds],
  );
  const filteredApartments = useMemo(
    () => apartments.filter((a) => matchesApartmentSearch(a, q)),
    [apartments, q],
  );
  /** Selected that disappear from filter while searching — keep visible so admin can uncheck */
  const selectedHiddenBySearch = useMemo(() => {
    if (!q) return [] as ApartmentRow[];
    return selectedApartments.filter((a) => !matchesApartmentSearch(a, q));
  }, [selectedApartments, q]);

  function formatApartment(a: ApartmentRow) {
    return t('orgAptFormat', { number: a.number, entrance: a.entrance });
  }

  function toggleApartment(id: string) {
    const has = form.apartmentIds.includes(id);
    const nextIds = has ? form.apartmentIds.filter((x) => x !== id) : [...form.apartmentIds, id];
    let primary = form.primaryApartmentId;
    if (!nextIds.includes(primary)) {
      primary = nextIds[0] ?? '';
    }
    onChange({ ...form, apartmentIds: nextIds, primaryApartmentId: primary });
  }

  function renderAptCheckbox(a: ApartmentRow) {
    return (
      <label
        key={a.id}
        style={{ display: 'flex', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={form.apartmentIds.includes(a.id)}
          onChange={() => toggleApartment(a.id)}
        />
        {formatApartment(a)}
      </label>
    );
  }

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>
        {isEdit
          ? t('orgEditUserTitle', {
              name: `${editingUser.firstName} ${editingUser.lastName}`,
            })
          : t('orgCreateUser')}
      </h2>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
        <input
          placeholder={t('email')}
          type="email"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder={isEdit ? t('orgPasswordKeep') : t('orgPasswordCreateHint')}
          value={form.password}
          onChange={(e) => onChange({ ...form, password: e.target.value })}
          required={false}
          minLength={form.password ? 8 : undefined}
        />
        {!isEdit && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
            {t('orgPasswordCreateHintDetail')}
          </p>
        )}
        <input
          placeholder={t('firstName')}
          value={form.firstName}
          onChange={(e) => onChange({ ...form, firstName: e.target.value })}
          required
        />
        <input
          placeholder={t('lastName')}
          value={form.lastName}
          onChange={(e) => onChange({ ...form, lastName: e.target.value })}
          required
        />
        <input
          placeholder={t('phone')}
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
        />
        <div>
          <select
            value={form.role}
            onChange={(e) =>
              onChange({
                ...form,
                role: e.target.value,
                ...(e.target.value !== 'resident'
                  ? { apartmentIds: [], primaryApartmentId: '' }
                  : {}),
              })
            }
            style={{ width: '100%' }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {getRoleLabel(r, t)}
              </option>
            ))}
          </select>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
            {t('orgRoleOneMembershipHint')}
          </p>
        </div>
        {isEdit && canAddResidentRole && onAddResidentRole && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '0.65rem 0.75rem',
              background: 'var(--surface-2, transparent)',
            }}
          >
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {t('orgAddResidentRoleHint')}
            </p>
            <button type="button" disabled={saving} onClick={onAddResidentRole}>
              {t('orgAddResidentRole')}
            </button>
          </div>
        )}
        {isEdit && (
          <select value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value })}>
            <option value="active">{t('statusActive')}</option>
            <option value="pending">{t('statusPending')}</option>
            <option value="blocked">{t('statusBlocked')}</option>
          </select>
        )}
        {showApartments && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('orgApartments')}</div>
              {form.apartmentIds.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {t('orgAptSelectedCount', { count: form.apartmentIds.length })}
                </div>
              )}
            </div>
            <input
              type="search"
              placeholder={t('search')}
              value={aptSearch}
              onChange={(e) => setAptSearch(e.target.value)}
              style={{ width: '100%', marginBottom: '0.5rem' }}
              aria-label={t('search')}
            />
            {selectedHiddenBySearch.length > 0 && (
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
                  {t('orgAptSelected')}
                </div>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {selectedHiddenBySearch.map(renderAptCheckbox)}
                </div>
              </div>
            )}
            <div style={{ maxHeight: 180, overflow: 'auto', display: 'grid', gap: '0.35rem' }}>
              {filteredApartments.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{t('orgAptSearchEmpty')}</div>
              ) : (
                filteredApartments.map(renderAptCheckbox)
              )}
            </div>
            {form.apartmentIds.length > 1 && (
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{t('orgPrimaryApt')}</label>
                <select
                  value={form.primaryApartmentId}
                  onChange={(e) => onChange({ ...form, primaryApartmentId: e.target.value })}
                  style={{ width: '100%', marginTop: '0.25rem' }}
                >
                  {form.apartmentIds.map((id) => {
                    const a = apartments.find((x) => x.id === id);
                    return a ? (
                      <option key={id} value={id}>
                        {formatApartment(a)}
                      </option>
                    ) : null;
                  })}
                </select>
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving}>
            {saving ? t('saving') : isEdit ? t('save') : t('create')}
          </button>
          {isEdit && (
            <button type="button" onClick={onCancel}>
              {t('cancel')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

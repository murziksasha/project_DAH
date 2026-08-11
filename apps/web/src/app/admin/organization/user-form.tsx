'use client';

import { CSSProperties, FormEvent, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PasswordField } from '@/components/ui/PasswordField';
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

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '0.85rem',
    color: 'var(--muted)',
    marginBottom: '0.25rem',
  };
  const fieldStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  };
  const fieldGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  };

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem', wordBreak: 'break-word' }}>
        {isEdit
          ? t('orgEditUserTitle', {
              name: `${editingUser.firstName} ${editingUser.lastName}`,
            })
          : t('orgCreateUser')}
      </h2>
      <form
        onSubmit={onSubmit}
        style={{
          display: 'grid',
          gap: '0.85rem',
          maxWidth: 520,
          width: '100%',
          minWidth: 0,
        }}
      >
        {/* Name first — always visible labels (placeholders hide when filled) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))',
            gap: '0.75rem',
            minWidth: 0,
          }}
        >
          <div style={fieldGroupStyle}>
            <label htmlFor="org-user-first-name" style={labelStyle}>
              {t('firstName')}
            </label>
            <input
              id="org-user-first-name"
              name="firstName"
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => onChange({ ...form, firstName: e.target.value })}
              required
              style={fieldStyle}
            />
          </div>
          <div style={fieldGroupStyle}>
            <label htmlFor="org-user-last-name" style={labelStyle}>
              {t('lastName')}
            </label>
            <input
              id="org-user-last-name"
              name="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => onChange({ ...form, lastName: e.target.value })}
              required
              style={fieldStyle}
            />
          </div>
        </div>

        <div style={fieldGroupStyle}>
          <label htmlFor="org-user-email" style={labelStyle}>
            {t('email')}
          </label>
          <input
            id="org-user-email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => onChange({ ...form, email: e.target.value })}
            required
            style={fieldStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label htmlFor="org-user-phone" style={labelStyle}>
            {t('phone')}
          </label>
          <input
            id="org-user-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => onChange({ ...form, phone: e.target.value })}
            style={fieldStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label htmlFor="org-user-password" style={labelStyle}>
            {t('password')}
          </label>
          <PasswordField
            id="org-user-password"
            name="password"
            autoComplete="new-password"
            placeholder={isEdit ? t('orgPasswordKeep') : t('orgPasswordCreateHint')}
            value={form.password}
            onChange={(e) => onChange({ ...form, password: e.target.value })}
            required={!isEdit}
            minLength={form.password ? 8 : undefined}
            style={fieldStyle}
          />
          {!isEdit && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
              {t('orgPasswordCreateHintDetail')}
            </p>
          )}
          {isEdit && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
              {t('orgPasswordKeep')}
            </p>
          )}
        </div>

        <div style={fieldGroupStyle}>
          <label htmlFor="org-user-role" style={labelStyle}>
            {t('orgRole')}
          </label>
          <select
            id="org-user-role"
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
            style={fieldStyle}
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
              minWidth: 0,
            }}
          >
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {t('orgAddResidentRoleHint')}
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={onAddResidentRole}
              style={{ maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }}
            >
              {t('orgAddResidentRole')}
            </button>
          </div>
        )}

        {isEdit && (
          <div style={fieldGroupStyle}>
            <label htmlFor="org-user-status" style={labelStyle}>
              {t('status')}
            </label>
            <select
              id="org-user-status"
              value={form.status}
              onChange={(e) => onChange({ ...form, status: e.target.value })}
              style={fieldStyle}
            >
              <option value="active">{t('statusActive')}</option>
              <option value="pending">{t('statusPending')}</option>
              <option value="blocked">{t('statusBlocked')}</option>
            </select>
          </div>
        )}

        {showApartments && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '0.75rem',
              minWidth: 0,
            }}
          >
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
              style={{ ...fieldStyle, marginBottom: '0.5rem' }}
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
                <label htmlFor="org-user-primary-apt" style={labelStyle}>
                  {t('orgPrimaryApt')}
                </label>
                <select
                  id="org-user-primary-apt"
                  value={form.primaryApartmentId}
                  onChange={(e) => onChange({ ...form, primaryApartmentId: e.target.value })}
                  style={fieldStyle}
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

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <button type="submit" disabled={saving} style={{ flex: '1 1 auto', minWidth: '7rem' }}>
            {saving ? t('saving') : isEdit ? t('save') : t('create')}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={onCancel}
              style={{ flex: '1 1 auto', minWidth: '7rem' }}
            >
              {t('cancel')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

'use client';

import { FormEvent } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { CREATE_ROLES, EDIT_ROLES, getRoleLabel } from './constants';
import { ApartmentRow, UserFormState, UserRow } from './types';

interface UserFormProps {
  form: UserFormState;
  editingUser: UserRow | null;
  apartments: ApartmentRow[];
  saving: boolean;
  onChange: (form: UserFormState) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}

export function UserForm({
  form,
  editingUser,
  apartments,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: UserFormProps) {
  const { t } = useI18n();
  const isEdit = !!editingUser;
  const showApartments = isEdit && form.role === 'resident';

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
          placeholder={isEdit ? t('orgPasswordKeep') : t('password')}
          value={form.password}
          onChange={(e) => onChange({ ...form, password: e.target.value })}
          required={!isEdit}
          minLength={isEdit ? undefined : 8}
        />
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
        <select value={form.role} onChange={(e) => onChange({ ...form, role: e.target.value })}>
          {(isEdit ? EDIT_ROLES : CREATE_ROLES).map((r) => (
            <option key={r} value={r}>
              {getRoleLabel(r, t)}
            </option>
          ))}
        </select>
        {isEdit && (
          <select value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value })}>
            <option value="active">{t('statusActive')}</option>
            <option value="pending">{t('statusPending')}</option>
            <option value="blocked">{t('statusBlocked')}</option>
          </select>
        )}
        {showApartments && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              {t('orgApartments')}
            </div>
            <div style={{ maxHeight: 160, overflow: 'auto', display: 'grid', gap: '0.35rem' }}>
              {apartments.map((a) => (
                <label key={a.id} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.apartmentIds.includes(a.id)}
                    onChange={() => toggleApartment(a.id)}
                  />
                  {formatApartment(a)}
                </label>
              ))}
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

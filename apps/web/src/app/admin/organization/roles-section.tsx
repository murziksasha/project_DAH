'use client';

import { CSSProperties, FormEvent, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { getRoleLabel } from './constants';
import { TenantRoleRow } from './types';

interface RolesSectionProps {
  roles: TenantRoleRow[];
  loading: boolean;
  saving: boolean;
  onReload: () => Promise<void>;
  onCreate: (code: string, labelUk?: string, labelRu?: string) => Promise<void>;
  onUpdate: (
    code: string,
    data: { isActive?: boolean; labelUk?: string | null; labelRu?: string | null },
  ) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
}

const ALL_CODES = [
  'chairman',
  'accountant',
  'board',
  'dispatcher',
  'crew',
  'auditor',
  'resident',
] as const;

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

export function RolesSection({
  roles,
  loading,
  saving,
  onCreate,
  onUpdate,
  onDelete,
}: RolesSectionProps) {
  const { t, locale } = useI18n();
  const [addCode, setAddCode] = useState('');
  const [editCode, setEditCode] = useState<string | null>(null);
  const [labelUk, setLabelUk] = useState('');
  const [labelRu, setLabelRu] = useState('');

  const present = new Set(roles.map((r) => r.code));
  const missingCodes = ALL_CODES.filter((c) => !present.has(c));

  function displayLabel(r: TenantRoleRow) {
    if (locale === 'ru') {
      return r.labelRu || r.labelDefault?.ru || getRoleLabel(r.code, t);
    }
    return r.labelUk || r.labelDefault?.uk || getRoleLabel(r.code, t);
  }

  function startEdit(r: TenantRoleRow) {
    setEditCode(r.code);
    setLabelUk(r.labelUk ?? '');
    setLabelRu(r.labelRu ?? '');
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!addCode) return;
    await onCreate(addCode);
    setAddCode('');
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editCode) return;
    await onUpdate(editCode, {
      labelUk: labelUk.trim() || null,
      labelRu: labelRu.trim() || null,
    });
    setEditCode(null);
  }

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{t('orgRolesTitle')}</h2>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
            {t('orgRolesHint')}
          </p>
        </div>
      </div>

      {/* Always visible: how to re-add a deleted role */}
      <div
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--surface-2, transparent)',
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
          {t('orgRolesAddTitle')}
        </div>
        {missingCodes.length > 0 ? (
          <form
            onSubmit={handleAdd}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))',
              gap: '0.5rem',
              alignItems: 'end',
              minWidth: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label htmlFor="org-roles-add-code" style={labelStyle}>
                {t('orgRolesAddPh')}
              </label>
              <select
                id="org-roles-add-code"
                value={addCode}
                onChange={(e) => setAddCode(e.target.value)}
                required
                style={fieldStyle}
              >
                <option value="">{t('orgRolesAddPh')}</option>
                {missingCodes.map((c) => (
                  <option key={c} value={c}>
                    {getRoleLabel(c, t)} ({c})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving || !addCode}
              style={{ minWidth: 0, width: '100%' }}
            >
              {t('orgRolesAdd')}
            </button>
          </form>
        ) : (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
            {t('orgRolesAddHintAllPresent')}
          </p>
        )}
      </div>

      {editCode && (
        <form
          onSubmit={handleSaveEdit}
          className="card"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            border: '1px solid var(--border)',
            minWidth: 0,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', wordBreak: 'break-word' }}>
            {t('orgRolesEdit')}: {editCode}
          </div>
          <div
            style={{
              display: 'grid',
              gap: '0.5rem',
              maxWidth: 420,
              width: '100%',
            }}
          >
            <div>
              <label htmlFor="org-roles-label-uk" style={labelStyle}>
                {t('orgRolesLabelUk')}
              </label>
              <input
                id="org-roles-label-uk"
                value={labelUk}
                onChange={(e) => setLabelUk(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor="org-roles-label-ru" style={labelStyle}>
                {t('orgRolesLabelRu')}
              </label>
              <input
                id="org-roles-label-ru"
                value={labelRu}
                onChange={(e) => setLabelRu(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" disabled={saving} style={{ flex: '1 1 auto', minWidth: '7rem' }}>
                {t('save')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditCode(null)}
                style={{ flex: '1 1 auto', minWidth: '7rem' }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </form>
      )}

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', fontSize: '0.9rem', minWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgRole')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgRolesCode')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgRolesMembers')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}>{t('orgStatus')}</th>
              <th style={{ padding: '0.35rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  {t('loading')}
                </td>
              </tr>
            )}
            {!loading && roles.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '1rem', color: 'var(--muted)' }}>
                  {t('orgRolesEmpty')}
                </td>
              </tr>
            )}
            {!loading &&
              roles.map((r) => (
                <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{displayLabel(r)}</td>
                  <td
                    style={{
                      padding: '0.35rem 0.5rem',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                    }}
                  >
                    {r.code}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{r.memberCount}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>
                    <span
                      style={{
                        color: r.isActive ? 'var(--success)' : 'var(--muted)',
                        fontWeight: 500,
                      }}
                    >
                      {r.isActive ? t('orgRolesActive') : t('orgRolesInactive')}
                    </span>
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.35rem',
                        minWidth: 0,
                      }}
                    >
                      <button
                        type="button"
                        style={{ fontSize: '0.8rem' }}
                        disabled={saving}
                        onClick={() => startEdit(r)}
                      >
                        {t('edit')}
                      </button>
                      {r.isActive ? (
                        <button
                          type="button"
                          style={{ fontSize: '0.8rem' }}
                          disabled={saving}
                          onClick={() => {
                            if (confirm(t('orgRolesDeactivateConfirm', { role: displayLabel(r) }))) {
                              void onUpdate(r.code, { isActive: false });
                            }
                          }}
                        >
                          {t('orgRolesDeactivate')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={{ fontSize: '0.8rem' }}
                          disabled={saving}
                          onClick={() => void onUpdate(r.code, { isActive: true })}
                        >
                          {t('orgRolesActivate')}
                        </button>
                      )}
                      <button
                        type="button"
                        style={{ fontSize: '0.8rem' }}
                        disabled={saving || !r.canDelete}
                        title={
                          !r.canDelete
                            ? r.memberCount > 0
                              ? t('orgRolesDeleteBlockedMembers')
                              : t('orgRolesDeleteBlockedProtected')
                            : undefined
                        }
                        onClick={() => {
                          if (!r.canDelete) return;
                          if (confirm(t('orgRolesDeleteConfirm', { role: displayLabel(r) }))) {
                            void onDelete(r.code);
                          }
                        }}
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

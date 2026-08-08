'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import {
  apiFetch,
  getToken,
  LoginMembership,
  persistAccessToken,
  type LoginResponse,
} from '@/lib/api';
import { getRoleHome, getStoredUser, type StoredUser } from '@/lib/auth';
import { setSelectedBuildingId } from '@/lib/building-context';

function activeMemberships(
  list: LoginMembership[] | StoredUser['memberships'] | undefined,
): LoginMembership[] {
  if (!list?.length) return [];
  return list.filter(
    (m) => m.status === 'active' && m.tenant?.isActive !== false,
  ) as LoginMembership[];
}

/** Stable select value: allows board + resident in the same org. */
export function membershipKey(m: { tenantId: string; role: string }) {
  return `${m.tenantId}:${m.role}`;
}

export function parseMembershipKey(value: string): { tenantId: string; role: string } | null {
  const i = value.indexOf(':');
  if (i <= 0) return null;
  return { tenantId: value.slice(0, i), role: value.slice(i + 1) };
}

const ROLE_I18N: Record<
  string,
  | 'roleChairman'
  | 'roleAccountant'
  | 'roleBoard'
  | 'roleDispatcher'
  | 'roleCrew'
  | 'roleAuditor'
  | 'roleResident'
> = {
  chairman: 'roleChairman',
  accountant: 'roleAccountant',
  board: 'roleBoard',
  dispatcher: 'roleDispatcher',
  crew: 'roleCrew',
  auditor: 'roleAuditor',
  resident: 'roleResident',
};

/**
 * Header switcher when the signed-in user has 2+ memberships (org and/or role personas).
 * Calls POST /auth/select-tenant { tenantId, role }.
 */
export function OrgMembershipSwitcher() {
  const { t } = useI18n();
  const [list, setList] = useState<LoginMembership[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const user = getStoredUser();
    if (!user || user.role === 'super_admin') {
      setList([]);
      return;
    }

    let memberships = activeMemberships(user.memberships);
    const token = getToken();
    // Always refresh when possible so dual roles appear after admin assigns them
    if (token) {
      try {
        const remote = await apiFetch<LoginMembership[]>('/auth/memberships', { token });
        memberships = activeMemberships(remote);
        if (memberships.length) {
          localStorage.setItem(
            'dah_user',
            JSON.stringify({ ...user, memberships: remote }),
          );
        }
      } catch {
        /* keep local */
      }
    }

    setList(memberships);
    if (memberships.length <= 1) return;

    const currentKey =
      (user.tenantId &&
        user.role &&
        memberships.some((m) => m.tenantId === user.tenantId && m.role === user.role) &&
        membershipKey({ tenantId: user.tenantId, role: user.role })) ||
      (memberships[0] ? membershipKey(memberships[0]) : '');
    setSelected(currentKey);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (list.length <= 1) return null;

  async function onChange(value: string) {
    if (!value || value === selected || busy) return;
    const parsed = parseMembershipKey(value);
    if (!parsed) return;
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setSelected(value);
    try {
      const data = await apiFetch<LoginResponse>('/auth/select-tenant', {
        method: 'POST',
        token,
        body: JSON.stringify({ tenantId: parsed.tenantId, role: parsed.role }),
      });
      if (!data.accessToken || !data.user) {
        throw new Error(t('orgSwitchError'));
      }
      persistAccessToken(data.accessToken);
      const memberships = data.memberships ?? data.user.memberships ?? list;
      localStorage.setItem(
        'dah_user',
        JSON.stringify({
          ...data.user,
          memberships,
        }),
      );
      setSelectedBuildingId(null);
      window.location.href = getRoleHome(data.user.role);
    } catch (err) {
      const u = getStoredUser();
      setSelected(
        u?.tenantId && u.role
          ? membershipKey({ tenantId: u.tenantId, role: u.role })
          : selected,
      );
      setBusy(false);
      window.alert(err instanceof Error ? err.message : t('orgSwitchError'));
    }
  }

  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
      title={t('orgMembershipSwitcher')}
    >
      <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t('orgMembershipSwitcher')}</span>
      <select
        value={selected}
        disabled={busy}
        aria-label={t('orgMembershipSwitcher')}
        onChange={(e) => void onChange(e.target.value)}
        style={{ maxWidth: 240 }}
      >
        {list.map((m) => {
          const roleKey = ROLE_I18N[m.role];
          const roleLabel = roleKey ? t(roleKey) : m.role;
          return (
            <option key={membershipKey(m)} value={membershipKey(m)}>
              {m.tenant.name}
              {roleLabel ? ` · ${roleLabel}` : ''}
            </option>
          );
        })}
      </select>
    </label>
  );
}

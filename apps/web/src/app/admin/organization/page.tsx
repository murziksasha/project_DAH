'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { getSelectedTenantId, setSelectedTenantId } from '@/lib/building-context';
import { downloadCsv } from '@/lib/csv';
import { ApartmentsSection } from './apartments-section';
import { getRoleLabel, PAGE_SIZE } from './constants';
import { RolesSection } from './roles-section';
import { UserForm } from './user-form';
import { UsersSection } from './users-section';
import {
  ApartmentRow,
  emptyUserForm,
  RolesListResponse,
  TenantRoleRow,
  UserFormState,
  UserRow,
  UserSortField,
  UsersListResponse,
} from './types';

interface TenantOption {
  id: string;
  name: string;
  slug: string;
  orgType?: string;
  isActive?: boolean;
}

export default function OrganizationPage() {
  const { t } = useI18n();
  const storedUser = typeof window !== 'undefined' ? getStoredUser() : null;
  const isSuperAdmin = storedUser?.role === 'super_admin';

  const [users, setUsers] = useState<UserRow[]>([]);
  const [residentUsers, setResidentUsers] = useState<UserRow[]>([]);
  const [apartments, setApartments] = useState<ApartmentRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<UserSortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [roles, setRoles] = useState<TenantRoleRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm());
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [pendingDeferredRoles, setPendingDeferredRoles] = useState<Array<'accountant' | 'auditor'>>([]);

  const tenantReady = !isSuperAdmin || Boolean(selectedTenant);
  const assignableRoleCodes = roles.filter((r) => r.isActive).map((r) => r.code);
  const allCatalogRoleCodes = roles.map((r) => r.code);

  useEffect(() => {
    setSelectedTenant(getSelectedTenantId());
    const onTenant = () => setSelectedTenant(getSelectedTenantId());
    window.addEventListener('dah-tenant-change', onTenant);
    return () => window.removeEventListener('dah-tenant-change', onTenant);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const token = getToken();
    if (!token) return;
    apiFetch<TenantOption[]>('/tenants', { token })
      .then(setTenants)
      .catch(() => setTenants([]));
  }, [isSuperAdmin]);

  const loadApartments = useCallback(async (token: string) => {
    const data = await apiFetch<ApartmentRow[]>('/building/apartments', { token });
    setApartments(data);
  }, []);

  const loadUsers = useCallback(
    async (
      token: string,
      p: number,
      q: string,
      role: string,
      status: string,
      sort: UserSortField,
      dir: 'asc' | 'desc',
    ) => {
      if (isSuperAdmin && !getSelectedTenantId()) {
        setUsers([]);
        setTotal(0);
        setLoadingUsers(false);
        return;
      }
      setLoadingUsers(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(PAGE_SIZE),
          sortBy: sort,
          sortDir: dir,
        });
        if (q.trim()) params.set('search', q.trim());
        if (role) params.set('role', role);
        if (status) params.set('status', status);
        const data = await apiFetch<UsersListResponse>(`/users?${params}`, { token });
        setUsers(data.items);
        setTotal(data.total);
      } finally {
        setLoadingUsers(false);
      }
    },
    [isSuperAdmin],
  );

  const loadResidents = useCallback(async (token: string) => {
    if (isSuperAdmin && !getSelectedTenantId()) {
      setResidentUsers([]);
      return;
    }
    const data = await apiFetch<UsersListResponse>(
      '/users?page=1&limit=100&role=resident',
      { token },
    );
    setResidentUsers(data.items.filter((u) => u.role === 'resident'));
  }, [isSuperAdmin]);

  const loadRoles = useCallback(async (token: string) => {
    if (isSuperAdmin && !getSelectedTenantId()) {
      setRoles([]);
      return;
    }
    setLoadingRoles(true);
    try {
      const data = await apiFetch<RolesListResponse>('/roles', { token });
      setRoles(data.items ?? []);
    } catch {
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, [isSuperAdmin]);

  const reload = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    if (isSuperAdmin && !getSelectedTenantId()) {
      setUsers([]);
      setResidentUsers([]);
      setRoles([]);
      setTotal(0);
      setLoadingUsers(false);
      return;
    }
    const [, , , , setupStatus] = await Promise.all([
      loadUsers(token, page, search, roleFilter, statusFilter, sortBy, sortDir),
      loadApartments(token),
      loadResidents(token),
      loadRoles(token),
      apiFetch<{ pendingDeferredRoles?: Array<'accountant' | 'auditor'> }>('/setup/status', {
        token,
      }).catch(() => ({ pendingDeferredRoles: [] })),
    ]);
    setPendingDeferredRoles(setupStatus.pendingDeferredRoles ?? []);
  }, [
    loadApartments,
    loadResidents,
    loadRoles,
    loadUsers,
    page,
    search,
    roleFilter,
    statusFilter,
    sortBy,
    sortDir,
    isSuperAdmin,
    selectedTenant,
  ]);

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : t('error')));
  }, [reload, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function handleTenantSelect(id: string) {
    setSelectedTenantId(id || null);
    setSelectedTenant(id || null);
    setPage(1);
    setError('');
    setMessage(id ? t('orgTenantContextSet') : '');
  }

  function handleSortChange(field: UserSortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
  }

  function startEditUser(user: UserRow) {
    setEditingUser(user);
    const apartmentIds = user.apartments?.map((a) => a.id) ?? (user.apartment ? [user.apartment.id] : []);
    const primary =
      user.apartments?.find((a) => a.isPrimary)?.id ??
      user.apartmentId ??
      apartmentIds[0] ??
      '';
    setUserForm({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? '',
      role: user.role,
      status: user.status,
      apartmentIds,
      primaryApartmentId: primary,
    });
    setMessage('');
    setError('');
    window.scrollTo({ top: document.body.scrollHeight * 0.35, behavior: 'smooth' });
  }

  function cancelEditUser() {
    setEditingUser(null);
    setUserForm(emptyUserForm());
  }

  function startCreateDeferredRole(role: 'accountant' | 'auditor') {
    setEditingUser(null);
    setUserForm({ ...emptyUserForm(), role });
    setMessage('');
    setError('');
    document.getElementById('org-user-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleUserSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    if (isSuperAdmin && !getSelectedTenantId()) {
      setError(t('orgSelectTenantHint'));
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingUser) {
        const body: Record<string, unknown> = {
          email: userForm.email,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          phone: userForm.phone || undefined,
          role: userForm.role,
          /** Which membership row is edited (board vs resident for same person) */
          membershipRole: editingUser.role,
          status: userForm.status,
        };
        if (userForm.password) body.password = userForm.password;
        if (userForm.role === 'resident') {
          body.apartmentIds = userForm.apartmentIds;
          body.primaryApartmentId = userForm.primaryApartmentId || userForm.apartmentIds[0] || null;
        }
        await apiFetch(`/users/${editingUser.id}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify(body),
        });
        setMessage(t('orgUserUpdated'));
        cancelEditUser();
      } else {
        const created = await apiFetch<UserRow>('/users', {
          method: 'POST',
          token,
          body: JSON.stringify({
            email: userForm.email,
            password: userForm.password || undefined,
            firstName: userForm.firstName,
            lastName: userForm.lastName,
            phone: userForm.phone || undefined,
            role: userForm.role,
          }),
        });
        // Create DTO has no apartments — attach links via PATCH when creating a resident
        if (
          userForm.role === 'resident' &&
          created?.id &&
          (userForm.apartmentIds.length > 0 || userForm.primaryApartmentId)
        ) {
          await apiFetch(`/users/${created.id}`, {
            method: 'PATCH',
            token,
            body: JSON.stringify({
              membershipRole: 'resident',
              role: 'resident',
              apartmentIds: userForm.apartmentIds,
              primaryApartmentId:
                userForm.primaryApartmentId || userForm.apartmentIds[0] || null,
            }),
          });
        }
        setMessage(t('orgUserCreated'));
        setUserForm(emptyUserForm());
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddResidentRole() {
    const token = getToken();
    if (!token || !editingUser) return;
    if (isSuperAdmin && !getSelectedTenantId()) {
      setError(t('orgSelectTenantHint'));
      return;
    }
    if (!confirm(t('orgAddResidentRoleConfirm', { name: `${editingUser.firstName} ${editingUser.lastName}` }))) {
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const created = await apiFetch<UserRow>('/users', {
        method: 'POST',
        token,
        body: JSON.stringify({
          email: editingUser.email,
          firstName: editingUser.firstName,
          lastName: editingUser.lastName,
          phone: editingUser.phone || undefined,
          role: 'resident',
        }),
      });
      setMessage(t('orgResidentRoleAdded'));
      await reload();
      // Open the new resident membership for apartment assignment
      const residentRow: UserRow = {
        ...editingUser,
        ...(created ?? {}),
        id: created?.id ?? editingUser.id,
        email: editingUser.email,
        firstName: editingUser.firstName,
        lastName: editingUser.lastName,
        phone: editingUser.phone,
        role: 'resident',
        status: created?.status ?? 'active',
        apartmentId: null,
        apartments: [],
        apartment: null,
      };
      startEditUser(residentRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBlock(user: UserRow) {
    const token = getToken();
    if (!token) return;
    const name = `${user.firstName} ${user.lastName}`;
    if (user.status === 'blocked') {
      if (!confirm(t('orgUnblockConfirm', { name }))) return;
      setSaving(true);
      try {
        await apiFetch(`/users/${user.id}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify({ status: 'active' }),
        });
        setMessage(t('orgUserUnblocked'));
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('error'));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!confirm(t('orgBlockConfirm', { name }))) return;
    setSaving(true);
    try {
      await apiFetch(`/users/${user.id}/block`, { method: 'PATCH', token });
      setMessage(t('orgUserBlocked'));
      if (editingUser?.id === user.id) cancelEditUser();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateApartment(data: {
    number: string;
    entrance: number;
    floor?: number;
    area: number;
  }) {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const buildingId =
        typeof window !== 'undefined' ? localStorage.getItem('dah_building_id') : null;
      await apiFetch('/building/apartments', {
        method: 'POST',
        token,
        body: JSON.stringify({ ...data, ...(buildingId ? { buildingId } : {}) }),
      });
      setMessage(t('orgAptAdded'));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateApartment(
    id: string,
    data: { number: string; entrance: number; floor?: number; area: number },
  ) {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/building/apartments/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(data),
      });
      setMessage(t('orgAptUpdated'));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteApartment(id: string) {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/building/apartments/${id}`, { method: 'DELETE', token });
      setMessage(t('orgAptDeleted'));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkUser(apartmentId: string, userId: string) {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/users/${userId}/apartments/${apartmentId}`, { method: 'POST', token });
      setMessage(t('orgResidentLinked'));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlinkUser(apartmentId: string, userId: string) {
    const token = getToken();
    if (!token) return;
    if (!confirm(t('orgUnlinkConfirm'))) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/users/${userId}/apartments/${apartmentId}`, { method: 'DELETE', token });
      setMessage(t('orgResidentUnlinked'));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>{t('orgTitle')}</h1>
        <p style={{ color: 'var(--muted)' }}>{t('orgSubtitle')}</p>
      </header>

      {isSuperAdmin && (
        <section
          className="card"
          style={{
            marginBottom: '1.5rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          <label style={{ fontWeight: 600 }}>{t('orgSelectTenant')}</label>
          <select
            value={selectedTenant ?? ''}
            onChange={(e) => handleTenantSelect(e.target.value)}
            style={{ minWidth: 240, flex: '1 1 200px' }}
          >
            <option value="">{t('orgSelectTenantPlaceholder')}</option>
            {tenants.map((tn) => (
              <option key={tn.id} value={tn.id}>
                {tn.name}
                {tn.isActive === false ? ` (${t('tenantsDisable')})` : ''}
              </option>
            ))}
          </select>
          {selectedTenant && (
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {tenants.find((x) => x.id === selectedTenant)?.name ?? selectedTenant}
            </span>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      {pendingDeferredRoles.length > 0 && tenantReady && (
        <section
          className="card"
          style={{
            marginBottom: '1.5rem',
            borderColor: 'var(--primary)',
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          <h2 style={{ fontSize: '1rem' }}>{t('orgFinishSetup')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {t('orgDeferredRolesHint')}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {pendingDeferredRoles.map((role) => (
              <button key={role} type="button" onClick={() => startCreateDeferredRole(role)}>
                {t('orgCreateRole', { role: getRoleLabel(role, t) })}
              </button>
            ))}
          </div>
        </section>
      )}

      {isSuperAdmin && tenantReady && (
        <RolesSection
          roles={roles}
          loading={loadingRoles}
          saving={saving}
          onReload={reload}
          onCreate={async (code) => {
            const token = getToken();
            if (!token) return;
            setSaving(true);
            setError('');
            try {
              const data = await apiFetch<RolesListResponse>('/roles', {
                method: 'POST',
                token,
                body: JSON.stringify({ code }),
              });
              setRoles(data.items ?? []);
              setMessage(t('orgRolesAdded'));
            } catch (err) {
              setError(err instanceof Error ? err.message : t('error'));
            } finally {
              setSaving(false);
            }
          }}
          onUpdate={async (code, body) => {
            const token = getToken();
            if (!token) return;
            setSaving(true);
            setError('');
            try {
              const data = await apiFetch<RolesListResponse>(`/roles/${code}`, {
                method: 'PATCH',
                token,
                body: JSON.stringify(body),
              });
              setRoles(data.items ?? []);
              setMessage(t('orgRolesUpdated'));
            } catch (err) {
              setError(err instanceof Error ? err.message : t('error'));
            } finally {
              setSaving(false);
            }
          }}
          onDelete={async (code) => {
            const token = getToken();
            if (!token) return;
            setSaving(true);
            setError('');
            try {
              const data = await apiFetch<RolesListResponse>(`/roles/${encodeURIComponent(code)}`, {
                method: 'DELETE',
                token,
              });
              setRoles(data.items ?? []);
              setMessage(t('orgRolesDeleted'));
            } catch (err) {
              setError(err instanceof Error ? err.message : t('error'));
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      <div id="org-user-form">
        <UserForm
          key={editingUser ? `${editingUser.id}:${editingUser.role}` : `create:${userForm.role}`}
          form={userForm}
          editingUser={editingUser}
          apartments={apartments}
          saving={saving}
          roleOptions={
            assignableRoleCodes.length
              ? assignableRoleCodes
              : undefined
          }
          canAddResidentRole={
            !!editingUser &&
            editingUser.role !== 'resident' &&
            editingUser.role !== 'super_admin' &&
            !users.some((u) => u.id === editingUser.id && u.role === 'resident') &&
            !residentUsers.some((u) => u.id === editingUser.id)
          }
          onAddResidentRole={handleAddResidentRole}
          onChange={setUserForm}
          onSubmit={handleUserSubmit}
          onCancel={cancelEditUser}
        />
      </div>

      <UsersSection
        users={users}
        total={total}
        page={page}
        search={searchInput}
        roleFilter={roleFilter}
        statusFilter={statusFilter}
        sortBy={sortBy}
        sortDir={sortDir}
        loading={loadingUsers}
        tenantReady={tenantReady}
        filterRoleOptions={
          allCatalogRoleCodes.length ? allCatalogRoleCodes : undefined
        }
        onSearchChange={setSearchInput}
        onRoleFilterChange={(v) => {
          setRoleFilter(v);
          setPage(1);
        }}
        onStatusFilterChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        onSortChange={handleSortChange}
        onPageChange={setPage}
        onEdit={startEditUser}
        onToggleBlock={handleToggleBlock}
      />

      <ApartmentsSection
        apartments={apartments}
        allUsers={residentUsers}
        saving={saving}
        onCreate={handleCreateApartment}
        onUpdate={handleUpdateApartment}
        onDelete={handleDeleteApartment}
        onLinkUser={handleLinkUser}
        onUnlinkUser={handleUnlinkUser}
        onEditUser={startEditUser}
        onExportCsv={() => {
          const rows: Array<Array<string | number>> = [
            ['Номер', "Під'їзд", 'Поверх', 'Площа', 'Мешканці'],
            ...apartments.map((a) => [
              a.number,
              a.entrance,
              a.floor ?? '',
              a.area,
              (a.users ?? [])
                .map((u) => `${u.firstName} ${u.lastName} <${u.email}>`)
                .join('; '),
            ]),
          ];
          downloadCsv(`kvartyry-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        }}
        onImportCsv={async (csv) => {
          const token = getToken();
          if (!token) return;
          setError('');
          try {
            const res = await apiFetch<{
              created: number;
              skipped: number;
              errors: Array<{ line: number; message: string }>;
            }>('/building/apartments/import', {
              method: 'POST',
              token,
              body: JSON.stringify({ csv }),
            });
            setMessage(
              t('orgImportResult', { created: res.created, skipped: res.skipped }) +
                (res.errors.length ? t('orgImportErrors', { count: res.errors.length }) : ''),
            );
            await loadApartments(token);
          } catch (err) {
            setError(err instanceof Error ? err.message : t('orgImportError'));
          }
        }}
      />
    </main>
  );
}

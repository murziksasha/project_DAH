'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { ApartmentsSection } from './apartments-section';
import { getRoleLabel, PAGE_SIZE } from './constants';
import { UserForm } from './user-form';
import { UsersSection } from './users-section';
import {
  ApartmentRow,
  emptyUserForm,
  UserFormState,
  UserRow,
  UsersListResponse,
} from './types';

export default function OrganizationPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [residentUsers, setResidentUsers] = useState<UserRow[]>([]);
  const [apartments, setApartments] = useState<ApartmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm());
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [pendingDeferredRoles, setPendingDeferredRoles] = useState<Array<'accountant' | 'auditor'>>([]);

  const loadApartments = useCallback(async (token: string) => {
    const data = await apiFetch<ApartmentRow[]>('/building/apartments', { token });
    setApartments(data);
  }, []);

  const loadUsers = useCallback(
    async (token: string, p: number, q: string) => {
      setLoadingUsers(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(PAGE_SIZE),
        });
        if (q.trim()) params.set('search', q.trim());
        const data = await apiFetch<UsersListResponse>(`/users?${params}`, { token });
        setUsers(data.items);
        setTotal(data.total);
      } finally {
        setLoadingUsers(false);
      }
    },
    [],
  );

  const loadResidents = useCallback(async (token: string) => {
    const data = await apiFetch<UsersListResponse>('/users?page=1&limit=100', { token });
    setResidentUsers(data.items.filter((u) => u.role === 'resident'));
  }, []);

  const reload = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const [, , , setupStatus] = await Promise.all([
      loadUsers(token, page, search),
      loadApartments(token),
      loadResidents(token),
      apiFetch<{ pendingDeferredRoles?: Array<'accountant' | 'auditor'> }>('/setup/status', {
        token,
      }).catch(() => ({ pendingDeferredRoles: [] })),
    ]);
    setPendingDeferredRoles(setupStatus.pendingDeferredRoles ?? []);
  }, [loadApartments, loadResidents, loadUsers, page, search]);

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
        await apiFetch('/users', {
          method: 'POST',
          token,
          body: JSON.stringify({
            email: userForm.email,
            password: userForm.password,
            firstName: userForm.firstName,
            lastName: userForm.lastName,
            phone: userForm.phone || undefined,
            role: userForm.role,
          }),
        });
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

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      {pendingDeferredRoles.length > 0 && (
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

      <div id="org-user-form">
        <UserForm
          form={userForm}
          editingUser={editingUser}
          apartments={apartments}
          saving={saving}
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
        loading={loadingUsers}
        onSearchChange={setSearchInput}
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
          // CSV column headers intentionally left in Ukrainian (export content)
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

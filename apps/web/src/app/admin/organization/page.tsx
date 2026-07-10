'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';
import { ApartmentsSection } from './apartments-section';
import { PAGE_SIZE } from './constants';
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
    await Promise.all([
      loadUsers(token, page, search),
      loadApartments(token),
      loadResidents(token),
    ]);
  }, [loadApartments, loadResidents, loadUsers, page, search]);

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : 'Помилка'));
  }, [reload]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
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
        setMessage('Користувача оновлено');
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
        setMessage('Користувача створено');
        setUserForm(emptyUserForm());
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBlock(user: UserRow) {
    const token = getToken();
    if (!token) return;
    if (user.status === 'blocked') {
      if (!confirm(`Розблокувати ${user.firstName} ${user.lastName}?`)) return;
      setSaving(true);
      try {
        await apiFetch(`/users/${user.id}`, {
          method: 'PATCH',
          token,
          body: JSON.stringify({ status: 'active' }),
        });
        setMessage('Користувача розблоковано');
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Помилка');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!confirm(`Заблокувати ${user.firstName} ${user.lastName}?`)) return;
    setSaving(true);
    try {
      await apiFetch(`/users/${user.id}/block`, { method: 'PATCH', token });
      setMessage('Користувача заблоковано');
      if (editingUser?.id === user.id) cancelEditUser();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
      await apiFetch('/building/apartments', { method: 'POST', token, body: JSON.stringify(data) });
      setMessage('Квартиру додано');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
      setMessage('Квартиру оновлено');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
      setMessage('Квартиру видалено');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
      setMessage('Мешканця прив\'язано до квартири');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlinkUser(apartmentId: string, userId: string) {
    const token = getToken();
    if (!token) return;
    if (!confirm('Відв\'язати мешканця від цієї квартири?')) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/users/${userId}/apartments/${apartmentId}`, { method: 'DELETE', token });
      setMessage('Мешканця відв\'язано');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
      throw err;
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Організація ОСМД</h1>
        <p style={{ color: 'var(--muted)' }}>Користувачі та квартири (системний адміністратор)</p>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

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

      <UserForm
        form={userForm}
        editingUser={editingUser}
        apartments={apartments}
        saving={saving}
        onChange={setUserForm}
        onSubmit={handleUserSubmit}
        onCancel={cancelEditUser}
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
      />
    </main>
  );
}
'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  apartment?: { number: string; entrance: number } | null;
}

interface ApartmentRow {
  id: string;
  number: string;
  entrance: number;
  floor: number | null;
  area: number;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Системний адмін',
  chairman: 'Голова',
  accountant: 'Бухгалтер',
  board: 'Правління',
  auditor: 'Ревізія',
  resident: 'Мешканець',
};

export default function OrganizationPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [apartments, setApartments] = useState<ApartmentRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'board',
  });
  const [newApt, setNewApt] = useState({ number: '', entrance: '1', floor: '', area: '' });

  async function load() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const [u, a] = await Promise.all([
      apiFetch<UserRow[]>('/users', { token }),
      apiFetch<ApartmentRow[]>('/building/apartments', { token }),
    ]);
    setUsers(u);
    setApartments(a);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await apiFetch('/users', {
        method: 'POST',
        token,
        body: JSON.stringify(newUser),
      });
      setMessage('Користувача створено');
      setNewUser({ email: '', password: '', firstName: '', lastName: '', role: 'board' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function blockUser(id: string) {
    const token = getToken();
    if (!token) return;
    if (!confirm('Заблокувати користувача?')) return;
    try {
      await apiFetch(`/users/${id}/block`, { method: 'PATCH', token });
      setMessage('Користувача заблоковано');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function createApartment(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch('/building/apartments', {
        method: 'POST',
        token,
        body: JSON.stringify({
          number: newApt.number,
          entrance: Number(newApt.entrance) || 1,
          floor: newApt.floor ? Number(newApt.floor) : undefined,
          area: Number(newApt.area),
        }),
      });
      setMessage('Квартиру додано');
      setNewApt({ number: '', entrance: '1', floor: '', area: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <Link href="/admin/setup" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Майстер налаштування</Link>
        <h1 style={{ marginTop: '0.5rem' }}>Організація ОСМД</h1>
        <p style={{ color: 'var(--muted)' }}>Користувачі та квартири (системний адміністратор)</p>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Користувачі</h2>
        <table style={{ width: '100%', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th>Ім&apos;я</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.firstName} {u.lastName}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                <td>{u.status}</td>
                <td>
                  {u.role !== 'super_admin' && u.status !== 'blocked' && (
                    <button type="button" onClick={() => blockUser(u.id)} style={{ fontSize: '0.8rem' }}>
                      Блок
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Створити користувача</h2>
        <form onSubmit={createUser} style={{ display: 'grid', gap: '0.75rem', maxWidth: 420 }}>
          <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
          <input type="password" placeholder="Пароль" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
          <input placeholder="Ім'я" value={newUser.firstName} onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} required />
          <input placeholder="Прізвище" value={newUser.lastName} onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} required />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
            <option value="chairman">Голова</option>
            <option value="accountant">Бухгалтер</option>
            <option value="auditor">Ревізія</option>
            <option value="board">Правління</option>
          </select>
          <button type="submit">Створити</button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: '1rem' }}>Квартири ({apartments.length})</h2>
        <form onSubmit={createApartment} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '0.5rem', marginBottom: '1rem' }}>
          <input placeholder="№" value={newApt.number} onChange={(e) => setNewApt({ ...newApt, number: e.target.value })} required />
          <input placeholder="Під'їзд" value={newApt.entrance} onChange={(e) => setNewApt({ ...newApt, entrance: e.target.value })} />
          <input placeholder="Поверх" value={newApt.floor} onChange={(e) => setNewApt({ ...newApt, floor: e.target.value })} />
          <input placeholder="Площа" value={newApt.area} onChange={(e) => setNewApt({ ...newApt, area: e.target.value })} required />
          <button type="submit">+</button>
        </form>
        <div style={{ maxHeight: 240, overflow: 'auto', fontSize: '0.9rem' }}>
          {apartments.map((a) => (
            <div key={a.id} style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--border)' }}>
              кв. {a.number} · під&apos;їзд {a.entrance} · {a.area} м²
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
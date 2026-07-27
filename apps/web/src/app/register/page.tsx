'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Apartment {
  id: string;
  entrance: number;
  number: string;
}

interface RegisterResponse {
  user: { id: string; email: string; firstName: string; lastName: string; status: string };
  message: string;
}

export default function RegisterPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [apartmentId, setApartmentId] = useState('');
  const [aptQuery, setAptQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingApartments, setLoadingApartments] = useState(true);
  const [registrationClosed, setRegistrationClosed] = useState(false);

  useEffect(() => {
    apiFetch<Apartment[]>('/auth/apartments')
      .then((list) => {
        setApartments(list);
        if (list.length > 0) setApartmentId(list[0].id);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Не вдалося завантажити список квартир';
        setError(msg);
        if (/вимкнен|disabled|заборонен/i.test(msg)) setRegistrationClosed(true);
      })
      .finally(() => setLoadingApartments(false));
  }, []);

  const filtered = useMemo(() => {
    const q = aptQuery.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter(
      (a) => a.number.toLowerCase().includes(q) || String(a.entrance).includes(q),
    );
  }, [apartments, aptQuery]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          phone: phone || undefined,
          apartmentId,
        }),
      });
      setSuccess(data.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Помилка реєстрації';
      setError(msg);
      if (/вимкнен/i.test(msg)) setRegistrationClosed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Реєстрація мешканця</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Вкажіть квартиру. Після підтвердження правлінням зможете увійти в кабінет.
      </p>

      {registrationClosed && !success ? (
        <div className="card">
          <p style={{ marginBottom: '0.75rem' }}>
            Самостійна реєстрація зараз вимкнена. Зверніться до голови правління або бухгалтера ОСМД.
          </p>
          <Link href="/login" className="btn btn-sm">
            На сторінку входу
          </Link>
        </div>
      ) : success ? (
        <div className="card" style={{ display: 'grid', gap: '1rem' }}>
          <p style={{ color: 'var(--success)', fontWeight: 600 }}>Заявку прийнято</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>{success}</p>
          <p style={{ fontSize: '0.9rem' }}>
            Зазвичай підтвердження займає 1–2 робочі дні. Після цього увійдіть з email і паролем.
          </p>
          <Link href="/login" className="btn" style={{ textAlign: 'center' }}>
            Перейти до входу
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div className="grid-2">
            <div>
              <label htmlFor="firstName">Ім&apos;я</label>
              <input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="lastName">Прізвище</label>
              <input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                autoComplete="family-name"
              />
            </div>
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="phone">Телефон (необов&apos;язково)</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
          <div>
            <label htmlFor="password">Пароль (мін. 8 символів)</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="apt-q">Пошук квартири</label>
            <input
              id="apt-q"
              value={aptQuery}
              onChange={(e) => setAptQuery(e.target.value)}
              placeholder="Номер квартири"
              disabled={loadingApartments}
            />
          </div>
          <div>
            <label htmlFor="apartment">Квартира</label>
            <select
              id="apartment"
              value={apartmentId}
              onChange={(e) => setApartmentId(e.target.value)}
              required
              disabled={loadingApartments || filtered.length === 0}
            >
              {loadingApartments && <option value="">Завантаження…</option>}
              {!loadingApartments && filtered.length === 0 && (
                <option value="">Квартир не знайдено</option>
              )}
              {filtered.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  Під&apos;їзд {apt.entrance}, кв. {apt.number}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || loadingApartments || !apartmentId}>
            {loading ? 'Надсилання…' : 'Надіслати заявку'}
          </button>
        </form>
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        Вже є обліковий запис? <Link href="/login">Увійти</Link>
      </p>
    </main>
  );
}

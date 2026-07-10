'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingApartments, setLoadingApartments] = useState(true);

  useEffect(() => {
    apiFetch<Apartment[]>('/auth/apartments')
      .then((list) => {
        setApartments(list);
        if (list.length > 0) setApartmentId(list[0].id);
      })
      .catch(() => setError('Не вдалося завантажити список квартир'))
      .finally(() => setLoadingApartments(false));
  }, []);

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
      setError(err instanceof Error ? err.message : 'Помилка реєстрації');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Реєстрація</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Мешканець: вкажіть квартиру та очікуйте підтвердження від правління
      </p>

      {success ? (
        <div className="card" style={{ display: 'grid', gap: '1rem' }}>
          <p style={{ color: 'var(--success)' }}>{success}</p>
          <Link href="/login" className="btn" style={{ textAlign: 'center' }}>
            Перейти до входу
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label htmlFor="firstName">Ім&apos;я</label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="lastName">Прізвище</label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="phone">Телефон (необов&apos;язково)</label>
            <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label htmlFor="password">Пароль (мін. 6 символів)</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label htmlFor="apartment">Квартира</label>
            <select
              id="apartment"
              value={apartmentId}
              onChange={(e) => setApartmentId(e.target.value)}
              required
              disabled={loadingApartments}
            >
              {loadingApartments && <option value="">Завантаження...</option>}
              {apartments.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  Під&apos;їзд {apt.entrance}, кв. {apt.number}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || loadingApartments || !apartmentId}>
            {loading ? 'Реєстрація...' : 'Зареєструватися'}
          </button>
        </form>
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        Вже є обліковий запис? <Link href="/login">Увійти</Link>
      </p>
    </main>
  );
}
'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PendingApprovalCard } from '@/components/PendingApprovalCard';
import { useI18n } from '@/components/LocaleProvider';
import { PasswordField } from '@/components/ui/PasswordField';
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
  const { t, locale, setLocale } = useI18n();
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
  const [inviteCode, setInviteCode] = useState('');
  const [requiresInvite, setRequiresInvite] = useState(false);
  const [inviteHint, setInviteHint] = useState('');

  async function loadApartments(code?: string) {
    setLoadingApartments(true);
    setError('');
    try {
      const qs = code ? `?inviteCode=${encodeURIComponent(code)}` : '';
      const res = await apiFetch<{
        requiresInvite?: boolean;
        apartments?: Apartment[];
        message?: string;
      } | Apartment[]>(`/auth/apartments${qs}`);
      // Backward-compat: array or object
      if (Array.isArray(res)) {
        setApartments(res);
        setRequiresInvite(false);
        if (res[0]) setApartmentId(res[0].id);
      } else {
        setRequiresInvite(Boolean(res.requiresInvite));
        setInviteHint(res.message ?? '');
        const list = res.apartments ?? [];
        setApartments(list);
        if (list[0]) setApartmentId(list[0].id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('registerFailApts');
      setError(msg);
      if (/вимкнен|disabled|заборонен|отключ/i.test(msg)) setRegistrationClosed(true);
    } finally {
      setLoadingApartments(false);
    }
  }

  useEffect(() => {
    void loadApartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
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
          email: email.trim().toLowerCase(),
          password,
          firstName,
          lastName,
          phone: phone || undefined,
          apartmentId,
          inviteCode: inviteCode || undefined,
        }),
      });
      setSuccess(data.message || t('registerSuccess'));
      try {
        sessionStorage.setItem('dah_pending_email', email);
      } catch {
        /* ignore */
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('registerFail');
      setError(msg);
      if (/вимкнен|disabled|отключ/i.test(msg)) setRegistrationClosed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          aria-label={locale === 'uk' ? 'RU' : 'UK'}
          title={t('language')}
          onClick={() => setLocale(locale === 'uk' ? 'ru' : 'uk')}
        >
          {locale === 'uk' ? 'RU' : 'UK'}
        </button>
      </div>
      <h1 style={{ marginBottom: '0.5rem' }}>{t('registerTitle')}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>{t('registerSubtitle')}</p>

      {registrationClosed && !success ? (
        <div className="card">
          <p style={{ marginBottom: '0.75rem' }}>{t('registerClosedBody')}</p>
          <Link href="/login" className="btn btn-sm">
            {t('registerToLogin')}
          </Link>
        </div>
      ) : success ? (
        <PendingApprovalCard email={email} variant="register" />
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem' }}>
          {(requiresInvite || inviteCode) && (
            <div>
              <label htmlFor="inviteCode">Код запрошення</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="inviteCode"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="від правління"
                  required={requiresInvite}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => void loadApartments(inviteCode)}
                >
                  OK
                </button>
              </div>
              {inviteHint && (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>{inviteHint}</p>
              )}
            </div>
          )}
          <div className="grid-2">
            <div>
              <label htmlFor="firstName">{t('firstName')}</label>
              <input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="lastName">{t('lastName')}</label>
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
            <label htmlFor="email">{t('email')}</label>
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
            <label htmlFor="phone">{t('registerPhoneOptional')}</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>
          <PasswordField
            id="password"
            label={t('registerPasswordHint')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
          <div>
            <label htmlFor="apt-q">{t('registerApartmentSearch')}</label>
            <input
              id="apt-q"
              value={aptQuery}
              onChange={(e) => setAptQuery(e.target.value)}
              placeholder={t('registerAptPlaceholder')}
              disabled={loadingApartments}
            />
          </div>
          <div>
            <label htmlFor="apartment">{t('registerSelectApartment')}</label>
            <select
              id="apartment"
              value={apartmentId}
              onChange={(e) => setApartmentId(e.target.value)}
              required
              disabled={loadingApartments || filtered.length === 0}
            >
              {loadingApartments && <option value="">{t('registerLoadingApts')}</option>}
              {!loadingApartments && filtered.length === 0 && (
                <option value="">{t('registerNoApts')}</option>
              )}
              {filtered.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  {t('registerAptOption', { entrance: apt.entrance, number: apt.number })}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || loadingApartments || !apartmentId}>
            {loading ? t('registerSubmitting') : t('registerSubmit')}
          </button>
        </form>
      )}

      <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
        {t('registerHasAccount')} <Link href="/login">{t('registerLoginLink')}</Link>
      </p>
    </main>
  );
}

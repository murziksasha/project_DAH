'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface SetupStatus {
  hasBuilding: boolean;
  isInitialized: boolean;
  apartmentCount: number;
  fundCount: number;
  hasChairman: boolean;
  hasAccountant: boolean;
  hasAuditor: boolean;
  canComplete: boolean;
}

const STEPS = ['ОСМД', 'Банк', 'Квартири', 'Користувачі', 'Підтвердження'];

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [building, setBuilding] = useState({ name: '', address: '', edrpou: '' });
  const [bank, setBank] = useState({
    bankName: 'ПриватБанк',
    iban: '',
    description: 'Основний рахунок ОСМД',
  });
  const [apartmentText, setApartmentText] = useState('101,1,5,52.5\n102,1,5,48.0');
  const [users, setUsers] = useState({
    chairman: { email: '', password: '', firstName: '', lastName: '' },
    accountant: { email: '', password: '', firstName: '', lastName: '' },
    auditor: { email: '', password: '', firstName: '', lastName: '' },
    boardEmail: '',
    boardPassword: '',
    boardFirstName: '',
    boardLastName: '',
    addBoard: false,
  });

  async function loadStatus() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const s = await apiFetch<SetupStatus>('/setup/status', { token });
    setStatus(s);
    if (s.isInitialized) window.location.href = '/admin/organization';
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(err.message));
  }, []);

  async function submitStep(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (step === 0) {
        await apiFetch('/setup/building', {
          method: 'POST',
          token,
          body: JSON.stringify(building),
        });
        setMessage('Дані ОСМД збережено');
      } else if (step === 1) {
        await apiFetch('/setup/bank', {
          method: 'POST',
          token,
          body: JSON.stringify({
            ...bank,
            funds: [
              { name: 'Фонд утримання', type: 'maintenance', openingBalance: 0 },
              { name: 'Фонд капітального ремонту', type: 'capital_repair', openingBalance: 0 },
            ],
          }),
        });
        setMessage('Банківські реквізити збережено');
      } else if (step === 2) {
        const apartments = apartmentText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [number, entrance, floor, area] = line.split(',').map((v) => v.trim());
            return {
              number,
              entrance: Number(entrance) || 1,
              floor: floor ? Number(floor) : undefined,
              area: Number(area),
            };
          });
        await apiFetch('/setup/apartments', {
          method: 'POST',
          token,
          body: JSON.stringify({ apartments }),
        });
        setMessage(`Додано ${apartments.length} квартир`);
      } else if (step === 3) {
        const payload = [
          { ...users.chairman, role: 'chairman' },
          { ...users.accountant, role: 'accountant' },
          { ...users.auditor, role: 'auditor' },
        ];
        if (users.addBoard && users.boardEmail) {
          payload.push({
            email: users.boardEmail,
            password: users.boardPassword,
            firstName: users.boardFirstName,
            lastName: users.boardLastName,
            role: 'board' as const,
          });
        }
        await apiFetch('/setup/users', {
          method: 'POST',
          token,
          body: JSON.stringify({ users: payload }),
        });
        setMessage('Ключових користувачів створено');
      } else if (step === 4) {
        await apiFetch('/setup/complete', { method: 'POST', token });
        window.location.href = '/admin/organization';
        return;
      }

      await loadStatus();
      if (step < 4) setStep(step + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1rem' }}>
      <h1>Налаштування ОСМД</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
        Майстер першого запуску для системного адміністратора
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {STEPS.map((label, i) => (
          <span
            key={label}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 6,
              background: i === step ? 'var(--accent)' : 'var(--surface-2)',
              color: i === step ? '#fff' : 'var(--muted)',
              fontSize: '0.85rem',
            }}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {status && (
        <div className="card" style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          Квартири: {status.apartmentCount} · Фонди: {status.fundCount} ·
          Голова: {status.hasChairman ? 'так' : 'ні'} · Бухгалтер: {status.hasAccountant ? 'так' : 'ні'} ·
          Ревізія: {status.hasAuditor ? 'так' : 'ні'}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      <form onSubmit={submitStep} className="card" style={{ display: 'grid', gap: '1rem' }}>
        {step === 0 && (
          <>
            <div>
              <label>Назва ОСМД</label>
              <input value={building.name} onChange={(e) => setBuilding({ ...building, name: e.target.value })} required />
            </div>
            <div>
              <label>Адреса</label>
              <input value={building.address} onChange={(e) => setBuilding({ ...building, address: e.target.value })} required />
            </div>
            <div>
              <label>ЄДРПОУ</label>
              <input value={building.edrpou} onChange={(e) => setBuilding({ ...building, edrpou: e.target.value })} />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <label>Банк</label>
              <input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} required />
            </div>
            <div>
              <label>IBAN</label>
              <input value={bank.iban} onChange={(e) => setBank({ ...bank, iban: e.target.value })} required />
            </div>
            <div>
              <label>Опис рахунку</label>
              <input value={bank.description} onChange={(e) => setBank({ ...bank, description: e.target.value })} />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Автоматично створюються фонди утримання та капремонту.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label>Квартири (CSV: номер,під&apos;їзд,поверх,площа)</label>
              <textarea
                rows={8}
                value={apartmentText}
                onChange={(e) => setApartmentText(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {(['chairman', 'accountant', 'auditor'] as const).map((role) => (
              <fieldset key={role} style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: 8 }}>
                <legend style={{ padding: '0 0.5rem' }}>
                  {role === 'chairman' ? 'Голова правління' : role === 'accountant' ? 'Бухгалтер' : 'Ревізійна комісія'}
                </legend>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <input
                    placeholder="Email"
                    value={users[role].email}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], email: e.target.value } })}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Пароль (мін. 8 символів)"
                    value={users[role].password}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], password: e.target.value } })}
                    required
                  />
                  <input
                    placeholder="Ім'я"
                    value={users[role].firstName}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], firstName: e.target.value } })}
                    required
                  />
                  <input
                    placeholder="Прізвище"
                    value={users[role].lastName}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], lastName: e.target.value } })}
                    required
                  />
                </div>
              </fieldset>
            ))}
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={users.addBoard}
                onChange={(e) => setUsers({ ...users, addBoard: e.target.checked })}
              />
              Додати члена правління (опційно)
            </label>
            {users.addBoard && (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <input placeholder="Email" value={users.boardEmail} onChange={(e) => setUsers({ ...users, boardEmail: e.target.value })} />
                <input type="password" placeholder="Пароль" value={users.boardPassword} onChange={(e) => setUsers({ ...users, boardPassword: e.target.value })} />
                <input placeholder="Ім'я" value={users.boardFirstName} onChange={(e) => setUsers({ ...users, boardFirstName: e.target.value })} />
                <input placeholder="Прізвище" value={users.boardLastName} onChange={(e) => setUsers({ ...users, boardLastName: e.target.value })} />
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <p>
            Перевірте дані та завершіть налаштування. Після цього фінансовий кабінет стане доступним для голови,
            бухгалтера та ревізійної комісії.
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} style={{ background: 'var(--surface-2)' }}>
              Назад
            </button>
          )}
          <button type="submit" disabled={loading}>
            {loading ? 'Збереження...' : step === 4 ? 'Завершити налаштування' : 'Далі'}
          </button>
        </div>
      </form>

      <p style={{ marginTop: '1rem' }}>
        <Link href="/admin/organization" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Організація (після завершення)
        </Link>
      </p>
    </main>
  );
}
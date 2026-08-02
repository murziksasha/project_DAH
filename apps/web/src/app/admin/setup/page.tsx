'use client';

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
  nextStep: number;
  stepDone: {
    building: boolean;
    bank: boolean;
    apartments: boolean;
    users: boolean;
  };
  building: { name: string; address: string; edrpou: string | null } | null;
  bankAccount: { bankName: string; iban: string; description: string | null } | null;
  existingUsers: {
    chairman: { email: string; firstName: string; lastName: string } | null;
    accountant: { email: string; firstName: string; lastName: string } | null;
    auditor: { email: string; firstName: string; lastName: string } | null;
  };
  deferredSetupRoles: ('accountant' | 'auditor')[];
  pendingDeferredRoles: ('accountant' | 'auditor')[];
}

type SetupRole = 'chairman' | 'accountant' | 'auditor';
type DeferrableRole = 'accountant' | 'auditor';

const DEFERRABLE_ROLE_LABELS: Record<DeferrableRole, string> = {
  accountant: 'Бухгалтер',
  auditor: 'Ревізійна комісія',
};

const STEPS = ['Організація', 'Банк', 'Квартири', 'Користувачі', 'Підтвердження'];
const STEP_KEYS = ['building', 'bank', 'apartments', 'users'] as const;

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [building, setBuilding] = useState({ name: '', address: '', edrpou: '' });
  const [bank, setBank] = useState({
    bankName: 'ПриватБанк',
    iban: '',
    description: 'Основний рахунок організації',
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
  const [createLater, setCreateLater] = useState<Record<DeferrableRole, boolean>>({
    accountant: false,
    auditor: false,
  });

  function applyStatus(s: SetupStatus) {
    setStatus(s);
    if (!initialized) {
      setStep(s.nextStep);
      setInitialized(true);
    }
    if (s.building) {
      setBuilding({
        name: s.building.name,
        address: s.building.address,
        edrpou: s.building.edrpou ?? '',
      });
    }
    if (s.bankAccount) {
      setBank({
        bankName: s.bankAccount.bankName,
        iban: s.bankAccount.iban,
        description: s.bankAccount.description ?? '',
      });
    }
    if (s.existingUsers) {
      setUsers((prev) => {
        const next = { ...prev };
        for (const role of ['chairman', 'accountant', 'auditor'] as const) {
          const existing = s.existingUsers[role];
          if (existing) {
            next[role] = {
              email: existing.email,
              firstName: existing.firstName,
              lastName: existing.lastName,
              password: '',
            };
          }
        }
        return next;
      });
    }
    if (s.deferredSetupRoles) {
      setCreateLater({
        accountant: s.deferredSetupRoles.includes('accountant') && !s.hasAccountant,
        auditor: s.deferredSetupRoles.includes('auditor') && !s.hasAuditor,
      });
    }
    if (s.isInitialized) window.location.href = '/admin/organization';
  }

  async function loadStatus() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const s = await apiFetch<SetupStatus>('/setup/status', { token });
    applyStatus(s);
  }

  useEffect(() => {
    loadStatus().catch((err) => setError(err.message));
  }, []);

  function isStepDone(stepIndex: number): boolean {
    if (!status) return false;
    if (stepIndex >= 4) return status.canComplete;
    return status.stepDone[STEP_KEYS[stepIndex]];
  }

  function hasRoleFilled(role: SetupRole): boolean {
    if (!status) return false;
    if (role === 'chairman') return status.hasChairman;
    if (role === 'accountant') return status.hasAccountant;
    return status.hasAuditor;
  }

  function isRoleDeferred(role: DeferrableRole): boolean {
    return createLater[role] || (status?.deferredSetupRoles.includes(role) ?? false);
  }

  function isRoleResolved(role: SetupRole): boolean {
    if (role === 'chairman') return hasRoleFilled(role);
    return hasRoleFilled(role) || isRoleDeferred(role);
  }

  function missingForComplete(): string[] {
    if (!status) return [];
    const missing: string[] = [];
    if (!status.stepDone.building) missing.push('дані організації');
    if (!status.stepDone.bank) missing.push('банківські реквізити');
    if (!status.stepDone.apartments) missing.push('квартири');
    if (!status.hasChairman) missing.push('голова правління');
    if (!status.hasAccountant && !isRoleDeferred('accountant')) missing.push('бухгалтер');
    if (!status.hasAuditor && !isRoleDeferred('auditor')) missing.push('ревізійна комісія');
    return missing;
  }

  async function submitStep(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (step < 4 && isStepDone(step)) {
        setStep(step + 1);
        return;
      }

      if (step === 0) {
        await apiFetch('/setup/building', {
          method: 'POST',
          token,
          body: JSON.stringify(building),
        });
        setMessage('Дані організації збережено');
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
        const deferRoles = (['accountant', 'auditor'] as const).filter(
          (role) => isRoleDeferred(role) && !hasRoleFilled(role),
        );
        const payload: Array<{
          email: string;
          password: string;
          firstName: string;
          lastName: string;
          role: 'chairman' | 'accountant' | 'auditor' | 'board';
        }> = (['chairman', 'accountant', 'auditor'] as const)
          .filter((role) => !isRoleResolved(role))
          .map((role) => ({ ...users[role], role }));
        if (users.addBoard && users.boardEmail) {
          payload.push({
            email: users.boardEmail,
            password: users.boardPassword,
            firstName: users.boardFirstName,
            lastName: users.boardLastName,
            role: 'board',
          });
        }
        await apiFetch('/setup/users', {
          method: 'POST',
          token,
          body: JSON.stringify({ users: payload, deferRoles }),
        });
        setMessage(
          deferRoles.length > 0
            ? 'Користувачів збережено. Відкладені ролі можна створити в Організації.'
            : 'Ключових користувачів створено',
        );
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

  const stepComplete = step < 4 && isStepDone(step);
  const readOnly = stepComplete;

  return (
    <main>
      <h1>Налаштування організації</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
        Майстер першого запуску «Мій дім» (ОСББ або УК) — для системного адміністратора
      </p>

      <div className="setup-steps">
        {STEPS.map((label, i) => {
          const done = i < 4 && status?.stepDone[STEP_KEYS[i]];
          const active = i === step;
          return (
            <button
              key={label}
              type="button"
              className={`setup-step-pill${active ? ' active' : ''}${done ? ' done' : ''}`}
              onClick={() => done && setStep(i)}
              disabled={!done}
              aria-current={active ? 'step' : undefined}
            >
              {done ? '✓ ' : `${i + 1}. `}
              {label}
            </button>
          );
        })}
      </div>

      {status && (
        <div className="card" style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          Квартири: {status.apartmentCount} · Фонди: {status.fundCount} ·
          Голова: {status.hasChairman ? 'так' : 'ні'} · Бухгалтер: {status.hasAccountant ? 'так' : 'ні'} ·
          Ревізія: {status.hasAuditor ? 'так' : 'ні'}
        </div>
      )}

      {stepComplete && (
        <p className="success-banner">Цей крок уже виконано. Натисніть «Продовжити», щоб перейти далі.</p>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      <form onSubmit={submitStep} className="card" style={{ display: 'grid', gap: '1rem' }}>
        {step === 0 && (
          <>
            <div>
              <label>Назва організації (ОСББ / УК)</label>
              <input
                value={building.name}
                onChange={(e) => setBuilding({ ...building, name: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>Адреса</label>
              <input
                value={building.address}
                onChange={(e) => setBuilding({ ...building, address: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>ЄДРПОУ</label>
              <input
                value={building.edrpou}
                onChange={(e) => setBuilding({ ...building, edrpou: e.target.value })}
                readOnly={readOnly}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <label>Банк</label>
              <input
                value={bank.bankName}
                onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>IBAN</label>
              <input
                value={bank.iban}
                onChange={(e) => setBank({ ...bank, iban: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>Опис рахунку</label>
              <input
                value={bank.description}
                onChange={(e) => setBank({ ...bank, description: e.target.value })}
                readOnly={readOnly}
              />
            </div>
            {!readOnly && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Автоматично створюються фонди утримання та капремонту.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <div>
            <label>Квартири (CSV: номер,під&apos;їзд,поверх,площа)</label>
            <textarea
              rows={8}
              value={apartmentText}
              onChange={(e) => setApartmentText(e.target.value)}
              style={{ width: '100%' }}
              readOnly={readOnly}
            />
          </div>
        )}

        {step === 3 && (
          <>
            {(['chairman', 'accountant', 'auditor'] as const).map((role) => {
              const roleDone = hasRoleFilled(role);
              const deferrable = role !== 'chairman';
              const deferred = deferrable && isRoleDeferred(role);
              const roleReadOnly = readOnly || roleDone || deferred;
              return (
              <fieldset key={role} style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: 8 }}>
                <legend style={{ padding: '0 0.5rem' }}>
                  {role === 'chairman' ? 'Голова правління' : role === 'accountant' ? 'Бухгалтер' : 'Ревізійна комісія'}
                  {roleDone ? ' ✓' : deferred ? ' ⏳' : ''}
                </legend>
                {roleDone && (
                  <p className="success-banner" style={{ marginBottom: '0.75rem' }}>
                    Вже створено
                  </p>
                )}
                {deferred && !roleDone && (
                  <p className="success-banner" style={{ marginBottom: '0.75rem' }}>
                    Створення відкладено — додайте в розділі Організація
                  </p>
                )}
                {deferrable && !roleDone && !readOnly && (
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <input
                      type="checkbox"
                      checked={createLater[role]}
                      onChange={(e) =>
                        setCreateLater((prev) => ({ ...prev, [role]: e.target.checked }))
                      }
                    />
                    Створити пізніше
                  </label>
                )}
                {!deferred && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <input
                    placeholder="Email"
                    value={users[role].email}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], email: e.target.value } })}
                    required={!roleReadOnly}
                    readOnly={roleReadOnly}
                  />
                  {!roleReadOnly && (
                    <input
                      type="password"
                      placeholder="Пароль (мін. 8 символів)"
                      value={users[role].password}
                      onChange={(e) => setUsers({ ...users, [role]: { ...users[role], password: e.target.value } })}
                      required
                    />
                  )}
                  <input
                    placeholder="Ім'я"
                    value={users[role].firstName}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], firstName: e.target.value } })}
                    required={!roleReadOnly}
                    readOnly={roleReadOnly}
                  />
                  <input
                    placeholder="Прізвище"
                    value={users[role].lastName}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], lastName: e.target.value } })}
                    required={!roleReadOnly}
                    readOnly={roleReadOnly}
                  />
                </div>
                )}
              </fieldset>
            );
            })}
            {!readOnly && (
              <>
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
          </>
        )}

        {step === 4 && (
          <>
            <p>
              Перевірте дані та завершіть налаштування. Після цього фінансовий кабінет стане доступним для голови
              правління. Бухгалтера та ревізію можна додати зараз або пізніше в Організації.
            </p>
            {status && status.pendingDeferredRoles.length > 0 && (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                Відкладено: {status.pendingDeferredRoles.map((r) => DEFERRABLE_ROLE_LABELS[r]).join(', ')}
              </p>
            )}
            {status && !status.canComplete && (
              <p className="error">
                Ще потрібно: {missingForComplete().join(', ')}
              </p>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} style={{ background: 'var(--surface-2)' }}>
              Назад
            </button>
          )}
          <button
            type="submit"
            disabled={loading || (step === 4 && status !== null && !status.canComplete)}
          >
            {loading
              ? 'Збереження...'
              : step === 4
                ? 'Завершити налаштування'
                : stepComplete
                  ? 'Продовжити'
                  : 'Далі'}
          </button>
        </div>
      </form>
    </main>
  );
}
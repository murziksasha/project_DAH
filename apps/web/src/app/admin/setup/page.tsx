'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import type { I18nKey } from '@/lib/i18n';

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

const STEP_KEYS = ['building', 'bank', 'apartments', 'users'] as const;

const STEP_LABEL_KEYS: I18nKey[] = [
  'setupStepOrg',
  'setupStepBank',
  'setupStepApts',
  'setupStepUsers',
  'setupStepConfirm',
];

const DEFERRABLE_ROLE_KEYS: Record<DeferrableRole, I18nKey> = {
  accountant: 'setupRoleAccountant',
  auditor: 'setupRoleAuditor',
};

export default function SetupPage() {
  const { t } = useI18n();
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
    description: '',
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

  function roleTitle(role: SetupRole): string {
    if (role === 'chairman') return t('setupRoleChairman');
    if (role === 'accountant') return t('setupRoleAccountant');
    return t('setupRoleAuditor');
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
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
    if (!status.stepDone.building) missing.push(t('setupMissingBuilding'));
    if (!status.stepDone.bank) missing.push(t('setupMissingBank'));
    if (!status.stepDone.apartments) missing.push(t('setupMissingApts'));
    if (!status.hasChairman) missing.push(t('setupMissingChairman'));
    if (!status.hasAccountant && !isRoleDeferred('accountant')) missing.push(t('setupMissingAccountant'));
    if (!status.hasAuditor && !isRoleDeferred('auditor')) missing.push(t('setupMissingAuditor'));
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
        setMessage(t('setupSavedBuilding'));
      } else if (step === 1) {
        await apiFetch('/setup/bank', {
          method: 'POST',
          token,
          body: JSON.stringify({
            ...bank,
            // Fund names are stored as business data (UK); not UI chrome
            funds: [
              { name: 'Фонд утримання', type: 'maintenance', openingBalance: 0 },
              { name: 'Фонд капітального ремонту', type: 'capital_repair', openingBalance: 0 },
            ],
          }),
        });
        setMessage(t('setupSavedBank'));
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
        setMessage(t('setupAptsAdded', { count: apartments.length }));
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
            ? t('setupUsersSavedDeferred')
            : t('setupUsersCreated'),
        );
      } else if (step === 4) {
        await apiFetch('/setup/complete', { method: 'POST', token });
        window.location.href = '/admin/organization';
        return;
      }

      await loadStatus();
      if (step < 4) setStep(step + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  const stepComplete = step < 4 && isStepDone(step);
  const readOnly = stepComplete;

  return (
    <main>
      <h1>{t('setupTitle')}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
        {t('setupSubtitle')}
      </p>

      <div className="setup-steps">
        {STEP_LABEL_KEYS.map((labelKey, i) => {
          const done = i < 4 && status?.stepDone[STEP_KEYS[i]];
          const active = i === step;
          const label = t(labelKey);
          return (
            <button
              key={labelKey}
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
          {t('setupStatusApts')}: {status.apartmentCount} · {t('setupStatusFunds')}: {status.fundCount} ·
          {' '}{t('setupStatusChairman')}: {status.hasChairman ? t('yes') : t('no')} ·{' '}
          {t('setupStatusAccountant')}: {status.hasAccountant ? t('yes') : t('no')} ·{' '}
          {t('setupStatusAuditor')}: {status.hasAuditor ? t('yes') : t('no')}
        </div>
      )}

      {stepComplete && (
        <p className="success-banner">{t('setupStepDoneBanner')}</p>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      <form onSubmit={submitStep} className="card" style={{ display: 'grid', gap: '1rem' }}>
        {step === 0 && (
          <>
            <div>
              <label>{t('setupOrgName')}</label>
              <input
                value={building.name}
                onChange={(e) => setBuilding({ ...building, name: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>{t('setupAddress')}</label>
              <input
                value={building.address}
                onChange={(e) => setBuilding({ ...building, address: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>{t('setupEdrpou')}</label>
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
              <label>{t('setupBank')}</label>
              <input
                value={bank.bankName}
                onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>{t('setupIban')}</label>
              <input
                value={bank.iban}
                onChange={(e) => setBank({ ...bank, iban: e.target.value })}
                required
                readOnly={readOnly}
              />
            </div>
            <div>
              <label>{t('setupAccountDesc')}</label>
              <input
                value={bank.description}
                onChange={(e) => setBank({ ...bank, description: e.target.value })}
                readOnly={readOnly}
              />
            </div>
            {!readOnly && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                {t('setupFundsAuto')}
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <div>
            <label>{t('setupAptsCsv')}</label>
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
                  {roleTitle(role)}
                  {roleDone ? ' ✓' : deferred ? ' ⏳' : ''}
                </legend>
                {roleDone && (
                  <p className="success-banner" style={{ marginBottom: '0.75rem' }}>
                    {t('setupAlreadyCreated')}
                  </p>
                )}
                {deferred && !roleDone && (
                  <p className="success-banner" style={{ marginBottom: '0.75rem' }}>
                    {t('setupDeferredHint')}
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
                    {t('setupCreateLater')}
                  </label>
                )}
                {!deferred && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <input
                    placeholder={t('email')}
                    value={users[role].email}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], email: e.target.value } })}
                    required={!roleReadOnly}
                    readOnly={roleReadOnly}
                  />
                  {!roleReadOnly && (
                    <input
                      type="password"
                      placeholder={t('setupPasswordMin')}
                      value={users[role].password}
                      onChange={(e) => setUsers({ ...users, [role]: { ...users[role], password: e.target.value } })}
                      required
                    />
                  )}
                  <input
                    placeholder={t('firstName')}
                    value={users[role].firstName}
                    onChange={(e) => setUsers({ ...users, [role]: { ...users[role], firstName: e.target.value } })}
                    required={!roleReadOnly}
                    readOnly={roleReadOnly}
                  />
                  <input
                    placeholder={t('lastName')}
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
                  {t('setupAddBoard')}
                </label>
                {users.addBoard && (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <input placeholder={t('email')} value={users.boardEmail} onChange={(e) => setUsers({ ...users, boardEmail: e.target.value })} />
                    <input type="password" placeholder={t('password')} value={users.boardPassword} onChange={(e) => setUsers({ ...users, boardPassword: e.target.value })} />
                    <input placeholder={t('firstName')} value={users.boardFirstName} onChange={(e) => setUsers({ ...users, boardFirstName: e.target.value })} />
                    <input placeholder={t('lastName')} value={users.boardLastName} onChange={(e) => setUsers({ ...users, boardLastName: e.target.value })} />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <p>{t('setupConfirmBody')}</p>
            {status && status.pendingDeferredRoles.length > 0 && (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {t('setupDeferred', {
                  roles: status.pendingDeferredRoles
                    .map((r) => t(DEFERRABLE_ROLE_KEYS[r]))
                    .join(', '),
                })}
              </p>
            )}
            {status && !status.canComplete && (
              <p className="error">
                {t('setupStillNeed', { items: missingForComplete().join(', ') })}
              </p>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} style={{ background: 'var(--surface-2)' }}>
              {t('back')}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || (step === 4 && status !== null && !status.canComplete)}
          >
            {loading
              ? t('saving')
              : step === 4
                ? t('setupFinish')
                : stepComplete
                  ? t('setupContinue')
                  : t('next')}
          </button>
        </div>
      </form>
    </main>
  );
}

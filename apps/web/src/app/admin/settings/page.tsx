'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Settings {
  name: string;
  showDebtorsToResidents: boolean;
  registrationEnabled: boolean;
  showBankDetailsToResidents: boolean;
  defaultAccrualDueDays: number;
  locale: 'uk' | 'ru';
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    apiFetch<Settings>('/building/settings', { token })
      .then(setSettings)
      .catch((err) => setError(err.message));
  }, []);

  async function patch(partial: Partial<Settings>) {
    if (!settings) return;
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const updated = await apiFetch<Settings>('/building/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify(partial),
      });
      setSettings(updated);
      setMessage('Налаштування збережено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <main>
        {error ? <p className="error">{error}</p> : <p>Завантаження...</p>}
      </main>
    );
  }

  return (
    <main>
      <h1 style={{ marginBottom: '0.5rem' }}>Налаштування</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>{settings.name}</p>

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Прозорість</h2>
        <ToggleRow
          label="Список боржників для мешканців"
          hint="Мешканці бачать квартири з боргом"
          enabled={settings.showDebtorsToResidents}
          onToggle={() => patch({ showDebtorsToResidents: !settings.showDebtorsToResidents })}
          disabled={saving}
        />
        <ToggleRow
          label="Банківські реквізити в кабінеті"
          hint="Показувати IBAN мешканцям"
          enabled={settings.showBankDetailsToResidents}
          onToggle={() => patch({ showBankDetailsToResidents: !settings.showBankDetailsToResidents })}
          disabled={saving}
        />
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Доступ</h2>
        <ToggleRow
          label="Самостійна реєстрація мешканців"
          hint="Форма /register для нових користувачів"
          enabled={settings.registrationEnabled}
          onToggle={() => patch({ registrationEnabled: !settings.registrationEnabled })}
          disabled={saving}
        />
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Фінанси</h2>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="dueDays">Термін оплати нарахувань (днів)</label>
          <input
            id="dueDays"
            type="number"
            min={1}
            max={90}
            value={settings.defaultAccrualDueDays}
            onChange={(e) => setSettings({ ...settings, defaultAccrualDueDays: Number(e.target.value) })}
            onBlur={() => patch({ defaultAccrualDueDays: settings.defaultAccrualDueDays })}
          />
        </div>
        <div>
          <label htmlFor="locale">Мова інтерфейсу</label>
          <select
            id="locale"
            value={settings.locale}
            onChange={(e) => {
              const locale = e.target.value as 'uk' | 'ru';
              setSettings({ ...settings, locale });
              patch({ locale });
            }}
          >
            <option value="uk">Українська</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </section>
    </main>
  );
}

function ToggleRow({
  label,
  hint,
  enabled,
  onToggle,
  disabled,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{hint}</p>
      </div>
      <button type="button" onClick={onToggle} disabled={disabled}>
        {enabled ? 'Увімкнено' : 'Вимкнено'}
      </button>
    </div>
  );
}
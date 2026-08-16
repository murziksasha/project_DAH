'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import type { Locale } from '@/lib/i18n';

interface Settings {
  id?: string;
  name: string;
  address?: string;
  edrpou?: string | null;
  showDebtorsToResidents: boolean;
  registrationEnabled: boolean;
  registrationInviteCode?: string;
  expenseDualApprovalThreshold?: number | null;
  showBankDetailsToResidents: boolean;
  defaultAccrualDueDays: number;
  reminderDaysBeforeDue?: number;
  metersReadingDeadlineDay?: number;
  locale: 'uk' | 'ru';
  slaHoursByCategory?: Record<string, number>;
  journalSot?: boolean;
  strictBankRec?: boolean;
  defaultCashFlowSource?: 'legacy' | 'journal' | 'both';
}

export default function SettingsPage() {
  const { t, setLocale } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState({ name: '', address: '', edrpou: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [newBuilding, setNewBuilding] = useState({ name: '', address: '' });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPublicUrl(window.location.origin);
    }
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    apiFetch<Settings>('/building/settings', { token })
      .then((s) => {
        setSettings(s);
        setProfile({
          name: s.name ?? '',
          address: s.address ?? '',
          edrpou: s.edrpou ?? '',
        });
      })
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
      setSettings({ ...settings, ...updated });
      setMessage('Налаштування збережено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const updated = await apiFetch<{ name: string; address: string; edrpou: string | null }>(
        '/building',
        {
          method: 'PATCH',
          token,
          body: JSON.stringify({
            name: profile.name,
            address: profile.address,
            edrpou: profile.edrpou || null,
          }),
        },
      );
      setSettings((s) =>
        s
          ? {
              ...s,
              name: updated.name,
              address: updated.address,
              edrpou: updated.edrpou,
            }
          : s,
      );
      setMessage('Дані організації збережено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Не вдалося скопіювати посилання');
    }
  }

  async function createBuilding(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('/building/create', {
        method: 'POST',
        token,
        body: JSON.stringify(newBuilding),
      });
      setMessage('Будинок додано — оберіть його у перемикачі в шапці');
      setNewBuilding({ name: '', address: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <main>
        {error ? <p className="error">{error}</p> : <p style={{ color: 'var(--muted)' }}>Завантаження…</p>}
      </main>
    );
  }

  const qrSrc = publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`
    : '';

  return (
    <main>
      <PageHeader title="Налаштування" description={settings.name} />

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form
        onSubmit={createBuilding}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1rem' }}>Додати будинок (ЖК / multi-building)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
          Одне ОСББ може мати кілька будинків. Перемикач зʼявиться в шапці, якщо будинків ≥ 2.
        </p>
        <div>
          <label htmlFor="nb-name">Назва будинку</label>
          <input
            id="nb-name"
            value={newBuilding.name}
            onChange={(e) => setNewBuilding({ ...newBuilding, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="nb-addr">Адреса</label>
          <input
            id="nb-addr"
            value={newBuilding.address}
            onChange={(e) => setNewBuilding({ ...newBuilding, address: e.target.value })}
            required
          />
        </div>
        <button type="submit" disabled={saving}>
          Додати будинок
        </button>
      </form>

      <form
        onSubmit={saveProfile}
        className="card"
        style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '1rem' }}>Профіль організації</h2>
        <div>
          <label htmlFor="bname">Назва</label>
          <input
            id="bname"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="baddr">Адреса</label>
          <input
            id="baddr"
            value={profile.address}
            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="bedr">ЄДРПОУ</label>
          <input
            id="bedr"
            value={profile.edrpou}
            onChange={(e) => setProfile({ ...profile, edrpou: e.target.value })}
          />
        </div>
        <button type="submit" disabled={saving}>
          Зберегти профіль
        </button>
      </form>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Посилання для мешканців</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Надішліть адресу кабінету (KeenDNS / локальна мережа). Мешканці відкривають у браузері
          та можуть «Встановити застосунок» (PWA).
        </p>
        <div className="invite-url">{publicUrl || '—'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-sm" onClick={copyInvite} disabled={!publicUrl}>
            {copied ? 'Скопійовано' : 'Копіювати посилання'}
          </button>
          <a className="btn btn-sm btn-ghost" href={publicUrl || '#'} target="_blank" rel="noreferrer">
            Відкрити
          </a>
        </div>
        {qrSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="invite-qr"
            src={qrSrc}
            alt="QR-код посилання на кабінет"
            width={180}
            height={180}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Документи та звіти</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Конструктор квитанцій, PDF для зборів і колонок Excel — які поля бачать мешканці та
          які дані потрапляють у вигрузки.
        </p>
        <a className="btn btn-sm" href="/admin/document-templates">
          Відкрити конструктор документів
        </a>
      </section>

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
          hint="Показувати IBAN мешканцям для оплати внесків"
          enabled={settings.showBankDetailsToResidents}
          onToggle={() =>
            patch({ showBankDetailsToResidents: !settings.showBankDetailsToResidents })
          }
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
        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="invite-code">Код запрошення (реєстрація)</label>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
            Якщо задано — список квартир і реєстрація лише з цим кодом (захист від перебору).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="invite-code"
              value={settings.registrationInviteCode ?? ''}
              onChange={(e) =>
                setSettings({ ...settings, registrationInviteCode: e.target.value })
              }
              placeholder="напр. OSBB-2026"
              style={{ flex: 1, minWidth: 160 }}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={saving}
              onClick={() =>
                void patch({
                  registrationInviteCode: settings.registrationInviteCode ?? '',
                })
              }
            >
              Зберегти код
            </button>
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="dual-threshold">Подвійне підтвердження витрат від (₴)</label>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
            0 або порожньо — вимкнено. Більші витрати потребують другого підпису.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="dual-threshold"
              type="number"
              min={0}
              step={100}
              value={settings.expenseDualApprovalThreshold ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  expenseDualApprovalThreshold:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
              style={{ flex: 1, minWidth: 120 }}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={saving}
              onClick={() =>
                void patch({
                  expenseDualApprovalThreshold:
                    settings.expenseDualApprovalThreshold ?? null,
                })
              }
            >
              Зберегти
            </button>
          </div>
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
            Глибока бухгалтерія (Journal SoT)
          </h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Увімкніть після shadow-compare readyForSot. Записи як і раніше dual-run;
            читання балансів/звітів — з journal. Env JOURNAL_SOT перевизначає.
          </p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!settings.journalSot}
              onChange={(e) =>
                setSettings({ ...settings, journalSot: e.target.checked })
              }
            />
            journalSot — читати баланси з journal
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!settings.strictBankRec}
              onChange={(e) =>
                setSettings({ ...settings, strictBankRec: e.target.checked })
              }
            />
            strictBankRec — label strict у чеклісті (звірка банку)
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            Джерело cash-flow за замовчуванням
            <select
              value={settings.defaultCashFlowSource ?? 'legacy'}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultCashFlowSource: e.target.value as
                    | 'legacy'
                    | 'journal'
                    | 'both',
                })
              }
              style={{ display: 'block', marginTop: 4, minWidth: 160 }}
            >
              <option value="legacy">legacy</option>
              <option value="journal">journal</option>
              <option value="both">both (порівняння)</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={saving}
            onClick={() =>
              void patch({
                journalSot: !!settings.journalSot,
                strictBankRec: !!settings.strictBankRec,
                defaultCashFlowSource: settings.defaultCashFlowSource ?? 'legacy',
              })
            }
          >
            Зберегти finance flags
          </button>
        </div>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>SLA заявок (години)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Дедлайн заявки = години × пріоритет (urgent скорочує). Зберігається в Building.settings.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {(
            [
              ['sanitary', 'Сантехніка', 24],
              ['electric', 'Електрика', 24],
              ['cleaning', 'Прибирання', 72],
              ['elevator', 'Ліфт', 4],
              ['heating', 'Опалення', 12],
              ['other', 'Інше', 48],
              ['default', 'За замовч.', 48],
            ] as const
          ).map(([key, label, def]) => (
            <div key={key}>
              <label htmlFor={`sla-${key}`}>{label}</label>
              <input
                id={`sla-${key}`}
                type="number"
                min={1}
                max={720}
                value={settings.slaHoursByCategory?.[key] ?? def}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    slaHoursByCategory: {
                      ...(settings.slaHoursByCategory ?? {}),
                      [key]: Number(e.target.value),
                    },
                  })
                }
                onBlur={() =>
                  patch({
                    slaHoursByCategory: {
                      ...(settings.slaHoursByCategory ?? {}),
                      [key]: settings.slaHoursByCategory?.[key] ?? def,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Фінанси та нагадування</h2>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="dueDays">Термін оплати нарахувань (днів)</label>
          <input
            id="dueDays"
            type="number"
            min={1}
            max={90}
            value={settings.defaultAccrualDueDays}
            onChange={(e) =>
              setSettings({ ...settings, defaultAccrualDueDays: Number(e.target.value) })
            }
            onBlur={() => patch({ defaultAccrualDueDays: settings.defaultAccrualDueDays })}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="reminderDays">Email про борг за N днів до терміну</label>
          <input
            id="reminderDays"
            type="number"
            min={0}
            max={30}
            value={settings.reminderDaysBeforeDue ?? 3}
            onChange={(e) =>
              setSettings({ ...settings, reminderDaysBeforeDue: Number(e.target.value) })
            }
            onBlur={() => patch({ reminderDaysBeforeDue: settings.reminderDaysBeforeDue ?? 3 })}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="metersDeadline">Дедлайн показів лічильників (день місяця, 1–28)</label>
          <input
            id="metersDeadline"
            type="number"
            min={1}
            max={28}
            value={settings.metersReadingDeadlineDay ?? 5}
            onChange={(e) =>
              setSettings({
                ...settings,
                metersReadingDeadlineDay: Number(e.target.value),
              })
            }
            onBlur={() =>
              patch({
                metersReadingDeadlineDay: settings.metersReadingDeadlineDay ?? 5,
              })
            }
          />
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Мешканці бачать банер на домівці до цього дня, якщо покази ще не передано.
          </p>
        </div>
        <div>
          <label htmlFor="locale">{t('settingsLocale')}</label>
          <select
            id="locale"
            value={settings.locale}
            onChange={(e) => {
              const locale = e.target.value as Locale;
              setSettings({ ...settings, locale });
              setLocale(locale);
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
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1rem',
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{hint}</p>
      </div>
      <button
        type="button"
        className={enabled ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
        onClick={onToggle}
        disabled={disabled}
      >
        {enabled ? 'Увімкнено' : 'Вимкнено'}
      </button>
    </div>
  );
}

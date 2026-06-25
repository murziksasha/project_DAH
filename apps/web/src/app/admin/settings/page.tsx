'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Settings {
  name: string;
  showDebtorsToResidents: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  async function toggleDebtors() {
    if (!settings) return;
    const token = getToken();
    if (!token) return;
    const next = !settings.showDebtorsToResidents;
    try {
      const updated = await apiFetch<Settings>('/building/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ showDebtorsToResidents: next }),
      });
      setSettings(updated);
      setMessage(next ? 'Список боржників видимий мешканцям' : 'Список боржників приховано');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '1rem' }}>
      <Link href="/admin" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Дашборд</Link>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Налаштування</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>{settings?.name}</p>

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      {settings && (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Список боржників для мешканців</div>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Прозорість: мешканці бачать квартири з боргом
            </p>
          </div>
          <button type="button" onClick={toggleDebtors}>
            {settings.showDebtorsToResidents ? 'Увімкнено' : 'Вимкнено'}
          </button>
        </div>
      )}
    </main>
  );
}
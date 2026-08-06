'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  normalizeDocumentTemplatesConfig,
  type DocumentTemplatesConfig,
} from '@dah/shared';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';

const DocumentTemplateBuilder = dynamic(
  () =>
    import('@/components/DocumentTemplateBuilder').then((m) => m.DocumentTemplateBuilder),
  {
    ssr: false,
    loading: () => <p style={{ color: 'var(--muted)' }}>Завантаження конструктора…</p>,
  },
);

export default function DocumentTemplatesPage() {
  const [config, setConfig] = useState<DocumentTemplatesConfig | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    apiFetch<DocumentTemplatesConfig>('/building/document-templates', { token })
      .then((data) => {
        setConfig(normalizeDocumentTemplatesConfig(data));
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Помилка завантаження'),
      );
  }, []);

  function onChange(next: DocumentTemplatesConfig) {
    setConfig(next);
    setDirty(true);
    setMessage('');
  }

  async function save() {
    if (!config) return;
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const updated = await apiFetch<DocumentTemplatesConfig>(
        '/building/document-templates',
        {
          method: 'PATCH',
          token,
          body: JSON.stringify({
            forms: config.forms,
            exports: config.exports,
          }),
        },
      );
      setConfig(normalizeDocumentTemplatesConfig(updated));
      setDirty(false);
      setMessage('Шаблони збережено. Квитанції та PDF-звіти використовують активні макети.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (
      !window.confirm(
        'Скинути всі шаблони до стандартних? Незбережені зміни буде втрачено.',
      )
    ) {
      return;
    }
    setConfig(normalizeDocumentTemplatesConfig(null));
    setDirty(true);
    setMessage('Завантажено стандартні шаблони — натисніть «Зберегти», щоб застосувати.');
  }

  if (!config) {
    return (
      <main>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p style={{ color: 'var(--muted)' }}>Завантаження конструктора…</p>
        )}
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        title="Конструктор документів"
        description="Налаштуйте, яку інформацію бачать мешканці в квитанціях, і що потрапляє у звіти / Excel."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetDefaults}>
              Скинути до стандартних
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={saving || !dirty}
              onClick={save}
            >
              {saving ? 'Збереження…' : dirty ? 'Зберегти' : 'Збережено'}
            </button>
          </div>
        }
      />

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
          <strong>PDF-документи</strong> — блоки з змінними{' '}
          <code>{'{{apartmentNumber}}'}</code>, <code>{'{{balance}}'}</code> тощо.
          Активний шаблон типу «Квитанція» використовується для мешканців і масової
          друку; «Звіт правління» — для PDF зі сторінки звітів.
          <br />
          <strong>Excel / звіти</strong> — увімкніть або вимкніть колонки вигрузок і
          склад пакету ZIP.
        </p>
      </div>

      <DocumentTemplateBuilder config={config} onChange={onChange} />
    </main>
  );
}

'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken, uploadFile } from '@/lib/api';
import { formatDateUk } from '@/lib/money';

interface Document {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  fileUrl: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [fileKey, setFileKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const data = await apiFetch<Document[]>('/documents', { token });
    setDocuments(data);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      const uploaded = await uploadFile('/files/upload', file, token, 'documents');
      setFileKey(uploaded.key);
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка файлу');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !fileKey) return;
    setError('');
    setLoading(true);
    try {
      await apiFetch('/documents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title,
          description: description || undefined,
          fileKey,
          isPublic,
        }),
      });
      setMessage('Документ додано');
      setTitle('');
      setDescription('');
      setFileKey('');
      setFileName('');
      setIsPublic(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  async function togglePublic(doc: Document) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/documents/${doc.id}/visibility`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isPublic: !doc.isPublic }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Видалити документ?')) return;
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/documents/${id}`, { method: 'DELETE', token });
      setMessage('Документ видалено');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main>
      <PageHeader
        title="Документи організації"
        description="Публічні для мешканців і внутрішні для правління"
      />

      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.05rem' }}>Новий документ</h2>
        <div>
          <label>Назва</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label>Опис</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label>Файл</label>
          <input
            type="file"
            onChange={(e) => handleFile(e.target.files?.[0])}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
          />
          {fileName && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{fileName}</p>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Показувати мешканцям
        </label>
        <button type="submit" disabled={loading || !fileKey}>
          {loading ? 'Збереження…' : 'Додати'}
        </button>
      </form>

      <section className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.05rem' }}>Список ({documents.length})</h2>
        {documents.length === 0 ? (
          <EmptyState title="Документів немає" description="Додайте статут, протоколи, кошторис." />
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
            {documents.map((d) => (
              <li
                key={d.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                    {d.title}
                  </a>
                  {d.description && (
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{d.description}</p>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                    {formatDateUk(d.createdAt)} ·{' '}
                    <span className={`badge badge-${d.isPublic ? 'success' : 'muted'}`}>
                      {d.isPublic ? 'Публічний' : 'Внутрішній'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => togglePublic(d)}>
                    {d.isPublic ? 'Зробити внутрішнім' : 'Опублікувати'}
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(d.id)}>
                    Видалити
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

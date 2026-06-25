'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, getToken, uploadFile } from '@/lib/api';

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
  const [fileKey, setFileKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const data = await apiFetch<Document[]>('/documents', { token });
    setDocuments(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const token = getToken();
    if (!token) return;
    const uploaded = await uploadFile('/files/upload', file, token, 'documents');
    setFileKey(uploaded.key);
    setFileName(file.name);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !fileKey) return;
    setError('');
    try {
      await apiFetch('/documents', {
        method: 'POST',
        token,
        body: JSON.stringify({ title, description: description || undefined, fileKey, isPublic: true }),
      });
      setMessage('Документ додано');
      setTitle('');
      setDescription('');
      setFileKey('');
      setFileName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1rem' }}>
      <Link href="/admin" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>← Дашборд</Link>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Документи ОСМД</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>Публічні документи для мешканців</p>

      <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <label>Назва</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label>Опис</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label>Файл (PDF)</label>
          <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => handleFile(e.target.files?.[0])} />
          {fileName && <p style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{fileName}</p>}
        </div>
        {error && <p className="error">{error}</p>}
        {message && <p style={{ color: 'var(--success)' }}>{message}</p>}
        <button type="submit" disabled={!fileKey}>Опублікувати</button>
      </form>

      <section className="card">
        <h2 style={{ marginBottom: '1rem' }}>Опубліковані ({documents.length})</h2>
        <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
          {documents.map((d) => (
            <li key={d.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>{d.title}</a>
              {d.description && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{d.description}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
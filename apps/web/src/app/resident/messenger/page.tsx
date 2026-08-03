'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

interface Thread {
  id: string;
  title: string | null;
  kind: string;
  lastMessage?: { body: string; author: { firstName: string; lastName: string } } | null;
}

interface Message {
  id: string;
  body: string;
  authorId: string;
  author: { firstName: string; lastName: string };
}

export default function ResidentMessengerPage() {
  const me = getStoredUser();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setThreads(await apiFetch<Thread[]>('/messenger/threads', { token }));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function joinBuilding() {
    const token = getToken();
    if (!token) return;
    const t = await apiFetch<Thread>('/messenger/threads/building', {
      method: 'POST',
      token,
      body: '{}',
    });
    await load();
    await open(t.id);
  }

  async function open(id: string) {
    const token = getToken();
    if (!token) return;
    setActiveId(id);
    setMessages(await apiFetch<Message[]>(`/messenger/threads/${id}/messages`, { token }));
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !text.trim()) return;
    const token = getToken();
    if (!token) return;
    const msg = await apiFetch<Message>(`/messenger/threads/${activeId}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify({ body: text }),
    });
    setMessages((m) => [...m, msg]);
    setText('');
  }

  return (
    <main style={{ display: 'grid', gap: '1rem' }}>
      <PageHeader title="Месенджер" description="Спілкування з сусідами та правлінням" />
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={() => joinBuilding().catch((e) => setError(e.message))}>
        Приєднатись до чату будинку
      </button>
      <div className="grid-2">
        <section className="card">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', textAlign: 'left', marginBottom: 4 }}
              onClick={() => open(t.id)}
            >
              {t.title || t.kind}
            </button>
          ))}
        </section>
        <section className="card" style={{ display: 'grid', gap: 8 }}>
          <div style={{ minHeight: 200, display: 'grid', gap: 6, alignContent: 'start' }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  justifySelf: m.authorId === me?.id ? 'end' : 'start',
                  background: 'var(--surface-2)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 8,
                  maxWidth: '90%',
                }}
              >
                <small style={{ color: 'var(--muted)' }}>
                  {m.author.lastName} {m.author.firstName}
                </small>
                <div>{m.body}</div>
              </div>
            ))}
          </div>
          <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!activeId}
              placeholder="Повідомлення…"
            />
            <button type="submit" disabled={!activeId}>
              →
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

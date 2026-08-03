'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

interface Thread {
  id: string;
  title: string | null;
  kind: string;
  lastMessage?: {
    body: string;
    createdAt: string;
    author: { firstName: string; lastName: string };
  } | null;
  messageCount?: number;
}

interface Message {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  author: { id: string; firstName: string; lastName: string; role: string };
}

interface Peer {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default function AdminMessengerPage() {
  const me = getStoredUser();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [error, setError] = useState('');

  const loadThreads = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const data = await apiFetch<Thread[]>('/messenger/threads', { token });
    setThreads(data);
  }, []);

  useEffect(() => {
    loadThreads().catch((e) => setError(e.message));
    const token = getToken();
    if (token) {
      apiFetch<Peer[]>('/messenger/peers', { token })
        .then(setPeers)
        .catch(() => undefined);
    }
  }, [loadThreads]);

  async function openThread(id: string) {
    const token = getToken();
    if (!token) return;
    setActiveId(id);
    const msgs = await apiFetch<Message[]>(`/messenger/threads/${id}/messages`, { token });
    setMessages(msgs);
  }

  async function ensureBuilding() {
    const token = getToken();
    if (!token) return;
    const t = await apiFetch<Thread>('/messenger/threads/building', {
      method: 'POST',
      token,
      body: '{}',
    });
    await loadThreads();
    await openThread(t.id);
  }

  async function ensureBoard() {
    const token = getToken();
    if (!token) return;
    const t = await apiFetch<Thread>('/messenger/threads/board', {
      method: 'POST',
      token,
      body: '{}',
    });
    await loadThreads();
    await openThread(t.id);
  }

  async function startDm(peerUserId: string) {
    const token = getToken();
    if (!token) return;
    const t = await apiFetch<Thread>('/messenger/threads/direct', {
      method: 'POST',
      token,
      body: JSON.stringify({ peerUserId }),
    });
    await loadThreads();
    await openThread(t.id);
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
    await loadThreads();
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <PageHeader
        title="Месенджер"
        subtitle="Чат будинку, правління↔мешканці, особисті повідомлення"
      />
      {error && <p className="error">{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" onClick={() => ensureBuilding().catch((e) => setError(e.message))}>
          Чат будинку
        </button>
        <button type="button" onClick={() => ensureBoard().catch((e) => setError(e.message))}>
          Правління ↔ мешканці
        </button>
      </div>

      <div className="grid-2" style={{ alignItems: 'stretch', minHeight: 360 }}>
        <section className="card" style={{ display: 'grid', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Діалоги</h2>
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn btn-ghost${activeId === t.id ? ' active' : ''}`}
              style={{ textAlign: 'left' }}
              onClick={() => openThread(t.id).catch((e) => setError(e.message))}
            >
              <div style={{ fontWeight: 600 }}>{t.title || t.kind}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {t.lastMessage
                  ? `${t.lastMessage.author.lastName}: ${t.lastMessage.body.slice(0, 60)}`
                  : 'Немає повідомлень'}
              </div>
            </button>
          ))}
          {!threads.length && <p style={{ color: 'var(--muted)' }}>Немає чатів — створіть вище</p>}

          {peers.length > 0 && (
            <>
              <h3 style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Написати</h3>
              <div style={{ display: 'grid', gap: '0.25rem', maxHeight: 160, overflow: 'auto' }}>
                {peers.slice(0, 30).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startDm(p.id).catch((e) => setError(e.message))}
                  >
                    {p.lastName} {p.firstName} ({p.role})
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Повідомлення</h2>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'grid',
              gap: '0.5rem',
              maxHeight: 320,
              alignContent: 'start',
            }}
          >
            {!activeId && <p style={{ color: 'var(--muted)' }}>Оберіть діалог</p>}
            {messages.map((m) => {
              const mine = m.authorId === me?.id;
              return (
                <div
                  key={m.id}
                  style={{
                    justifySelf: mine ? 'end' : 'start',
                    maxWidth: '85%',
                    background: mine ? 'var(--primary-soft, #dbeafe)' : 'var(--surface-2)',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {m.author.lastName} {m.author.firstName}
                  </div>
                  <div>{m.body}</div>
                </div>
              );
            })}
          </div>
          <form onSubmit={send} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              style={{ flex: 1 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Написати…"
              disabled={!activeId}
            />
            <button type="submit" disabled={!activeId || !text.trim()}>
              Надіслати
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

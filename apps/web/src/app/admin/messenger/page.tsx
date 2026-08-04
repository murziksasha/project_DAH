'use client';

import { type CSSProperties, FormEvent, useCallback, useEffect, useState } from 'react';
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

const listBtnBase: CSSProperties = {
  width: '100%',
  justifyContent: 'flex-start',
  textAlign: 'left',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '0.15rem',
};

function activeListBtn(isActive: boolean): CSSProperties {
  return {
    ...listBtnBase,
    border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
    background: isActive
      ? 'color-mix(in srgb, var(--primary) 18%, var(--surface-2))'
      : undefined,
  };
}

export default function AdminMessengerPage() {
  const me = getStoredUser();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openingPeerId, setOpeningPeerId] = useState<string | null>(null);

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
    loadThreads().catch((e: Error) => setError(e.message));
    const token = getToken();
    if (token) {
      apiFetch<Peer[]>('/messenger/peers', { token })
        .then(setPeers)
        .catch((e: Error) => setError(e.message || 'Не вдалося завантажити контакти'));
    }
  }, [loadThreads]);

  async function openThread(id: string) {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      setActiveId(id);
      const msgs = await apiFetch<Message[]>(`/messenger/threads/${id}/messages`, { token });
      setMessages(msgs);
    } finally {
      setBusy(false);
    }
  }

  async function ensureBuilding() {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      const t = await apiFetch<Thread>('/messenger/threads/building', {
        method: 'POST',
        token,
        body: '{}',
      });
      await loadThreads();
      setActiveId(t.id);
      const msgs = await apiFetch<Message[]>(`/messenger/threads/${t.id}/messages`, { token });
      setMessages(msgs);
    } finally {
      setBusy(false);
    }
  }

  async function ensureBoard() {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      const t = await apiFetch<Thread>('/messenger/threads/board', {
        method: 'POST',
        token,
        body: '{}',
      });
      await loadThreads();
      setActiveId(t.id);
      const msgs = await apiFetch<Message[]>(`/messenger/threads/${t.id}/messages`, { token });
      setMessages(msgs);
    } finally {
      setBusy(false);
    }
  }

  async function startDm(peerUserId: string) {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    setOpeningPeerId(peerUserId);
    setError('');
    try {
      const t = await apiFetch<Thread>('/messenger/threads/direct', {
        method: 'POST',
        token,
        body: JSON.stringify({ peerUserId }),
      });
      await loadThreads();
      setActiveId(t.id);
      const msgs = await apiFetch<Message[]>(`/messenger/threads/${t.id}/messages`, { token });
      setMessages(msgs);
    } finally {
      setBusy(false);
      setOpeningPeerId(null);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !text.trim() || busy) return;
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const msg = await apiFetch<Message>(`/messenger/threads/${activeId}/messages`, {
        method: 'POST',
        token,
        body: JSON.stringify({ body: text }),
      });
      setMessages((m) => [...m, msg]);
      setText('');
      await loadThreads();
    } finally {
      setBusy(false);
    }
  }

  const activeThread = threads.find((t) => t.id === activeId);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <PageHeader
        title="Месенджер"
        description="Чат будинку, правління↔мешканці, особисті повідомлення"
      />
      {error && <p className="error">{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => ensureBuilding().catch((e: Error) => setError(e.message))}
        >
          Чат будинку
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => ensureBoard().catch((e: Error) => setError(e.message))}
        >
          Правління ↔ мешканці
        </button>
      </div>

      <div className="grid-2" style={{ alignItems: 'stretch', minHeight: 360 }}>
        <section className="card" style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Діалоги</h2>
          {threads.map((t) => {
            const isActive = activeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                style={activeListBtn(isActive)}
                onClick={() => openThread(t.id).catch((e: Error) => setError(e.message))}
              >
                <div style={{ fontWeight: 600 }}>{t.title || t.kind}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {t.lastMessage
                    ? `${t.lastMessage.author.lastName}: ${t.lastMessage.body.slice(0, 60)}`
                    : 'Немає повідомлень'}
                </div>
              </button>
            );
          })}
          {!threads.length && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>Немає чатів — створіть вище або оберіть контакт</p>
          )}

          <h3 style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>Написати</h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Натисніть контакт, щоб відкрити особистий чат
          </p>
          {peers.length === 0 ? (
            <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.85rem' }}>
              Немає активних контактів. Мешканці з’являться після схвалення реєстрації або створення в
              організації.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '0.25rem', maxHeight: 200, overflow: 'auto' }}>
              {peers.slice(0, 30).map((p) => {
                const opening = openingPeerId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                    }}
                    onClick={() => startDm(p.id).catch((e: Error) => setError(e.message))}
                  >
                    {opening
                      ? 'Відкриваємо…'
                      : `${p.lastName} ${p.firstName} (${p.role})`}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>
            Повідомлення
            {activeThread ? (
              <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.85rem' }}>
                {' · '}
                {activeThread.title || activeThread.kind}
              </span>
            ) : null}
          </h2>
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
            {!activeId && (
              <p style={{ color: 'var(--muted)' }}>
                Оберіть діалог зліва або натисніть контакт у «Написати»
              </p>
            )}
            {activeId && busy && messages.length === 0 && (
              <p style={{ color: 'var(--muted)' }}>Завантаження…</p>
            )}
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
              placeholder={activeId ? 'Написати…' : 'Спочатку оберіть діалог'}
              disabled={!activeId || busy}
            />
            <button type="submit" disabled={!activeId || !text.trim() || busy}>
              Надіслати
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

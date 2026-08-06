'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { apiFetch, getToken } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

interface Thread {
  id: string;
  title: string | null;
  kind: string;
  lastMessage?: {
    body: string;
    author: { firstName: string; lastName: string };
  } | null;
}

interface Message {
  id: string;
  body: string;
  authorId: string;
  author: { firstName: string; lastName: string };
  createdAt?: string;
}

function threadLabel(t: Thread, fallbackBuilding: string, fallbackChat: string): string {
  if (t.title) return t.title;
  if (t.kind === 'building') return fallbackBuilding;
  if (t.kind === 'board_residents') return fallbackChat;
  return t.kind;
}

export default function ResidentMessengerPage() {
  const { t } = useI18n();
  const me = getStoredUser();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    try {
      setThreads(await apiFetch<Thread[]>('/messenger/threads', { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function joinBuilding() {
    const token = getToken();
    if (!token) return;
    setJoining(true);
    setError('');
    try {
      const th = await apiFetch<Thread>('/messenger/threads/building', {
        method: 'POST',
        token,
        body: '{}',
      });
      await load();
      await open(th.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setJoining(false);
    }
  }

  async function open(id: string) {
    const token = getToken();
    if (!token) return;
    setActiveId(id);
    setError('');
    try {
      setMessages(await apiFetch<Message[]>(`/messenger/threads/${id}/messages`, { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !text.trim()) return;
    const token = getToken();
    if (!token) return;
    setSending(true);
    try {
      const msg = await apiFetch<Message>(`/messenger/threads/${activeId}/messages`, {
        method: 'POST',
        token,
        body: JSON.stringify({ body: text.trim() }),
      });
      setMessages((m) => [...m, msg]);
      setText('');
      setThreads((prev) =>
        prev.map((th) =>
          th.id === activeId
            ? {
                ...th,
                lastMessage: {
                  body: msg.body,
                  author: msg.author,
                },
              }
            : th,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setSending(false);
    }
  }

  const active = threads.find((th) => th.id === activeId) ?? null;

  return (
    <main className="resident-messenger">
      <Link href="/resident" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        {t('residentBackCabinet')}
      </Link>
      <PageHeader title={t('residentMessengerTitle')} description={t('residentMessengerDesc')} />
      {error && <p className="error">{error}</p>}
      {loading && <SkeletonCards count={1} />}

      {!loading && (
        <>
          <div className="resident-messenger-toolbar">
            <button
              type="button"
              className="btn"
              disabled={joining}
              onClick={() => void joinBuilding()}
            >
              {joining ? t('loading') : t('residentMessengerJoin')}
            </button>
          </div>

          {threads.length === 0 ? (
            <EmptyState
              title={t('residentMessengerEmpty')}
              description={t('residentMessengerEmptyDesc')}
            />
          ) : (
            <div className="resident-messenger-layout">
              <section className="card resident-messenger-threads" aria-label={t('residentMessengerChats')}>
                <ul className="resident-thread-list">
                  {threads.map((th) => {
                    const label = threadLabel(
                      th,
                      t('residentMessengerBuilding'),
                      t('residentMessengerBoard'),
                    );
                    const preview = th.lastMessage?.body;
                    return (
                      <li key={th.id}>
                        <button
                          type="button"
                          className={`resident-thread-item${activeId === th.id ? ' active' : ''}`}
                          onClick={() => void open(th.id)}
                        >
                          <span className="resident-thread-title">{label}</span>
                          {preview && (
                            <span className="resident-thread-preview">{preview}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="card resident-messenger-chat" aria-label={t('residentMessengerMessages')}>
                {!activeId ? (
                  <EmptyState
                    title={t('residentMessengerPick')}
                    description={t('residentMessengerPickDesc')}
                  />
                ) : (
                  <>
                    <h2 className="resident-section-title" style={{ marginBottom: 8 }}>
                      {active
                        ? threadLabel(
                            active,
                            t('residentMessengerBuilding'),
                            t('residentMessengerBoard'),
                          )
                        : t('residentMessengerMessages')}
                    </h2>
                    <div className="resident-message-list">
                      {messages.length === 0 ? (
                        <p className="resident-muted">{t('residentMessengerNoMessages')}</p>
                      ) : (
                        messages.map((m) => {
                          const mine = m.authorId === me?.id;
                          return (
                            <div
                              key={m.id}
                              className={`resident-message-bubble${mine ? ' is-mine' : ''}`}
                            >
                              {!mine && (
                                <small className="resident-muted">
                                  {m.author.lastName} {m.author.firstName}
                                </small>
                              )}
                              <div>{m.body}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <form onSubmit={send} className="resident-message-form">
                      <label htmlFor="msg-input" className="sr-only">
                        {t('residentMessengerPlaceholder')}
                      </label>
                      <input
                        id="msg-input"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={t('residentMessengerPlaceholder')}
                        autoComplete="off"
                      />
                      <button type="submit" className="btn" disabled={sending || !text.trim()}>
                        {t('send')}
                      </button>
                    </form>
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}

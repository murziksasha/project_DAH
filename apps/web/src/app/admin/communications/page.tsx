'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface Announcement {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  author: { firstName: string; lastName: string };
}

interface RequestItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  createdAt: string;
  author: { firstName: string; lastName: string };
  assignee: { firstName: string; lastName: string } | null;
}

interface PollOption {
  id: string;
  text: string;
  _count: { votes: number };
}

interface Poll {
  id: string;
  question: string;
  isActive: boolean;
  endsAt: string | null;
  options: PollOption[];
  _count: { votes: number };
}

type Section = 'announcements' | 'requests' | 'polls';

const STATUS_LABELS: Record<string, string> = {
  new: 'Нова',
  in_progress: 'В роботі',
  done: 'Виконано',
};

const REQUEST_CATEGORIES = [
  { value: 'sanitary', label: 'Сантехніка' },
  { value: 'electric', label: 'Електрика' },
  { value: 'cleaning', label: 'Прибирання' },
  { value: 'other', label: 'Інше' },
];

export default function CommunicationsPage() {
  const [section, setSection] = useState<Section>('announcements');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPinned, setAnnPinned] = useState(false);

  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  async function load() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const [a, r, p] = await Promise.all([
      apiFetch<Announcement[]>('/communications/announcements', { token }),
      apiFetch<RequestItem[]>('/communications/requests', { token }),
      apiFetch<Poll[]>('/communications/polls', { token }),
    ]);
    setAnnouncements(a);
    setRequests(r);
    setPolls(p);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function handleAnnouncement(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await apiFetch('/communications/announcements', {
        method: 'POST',
        token,
        body: JSON.stringify({ title: annTitle, body: annBody, isPinned: annPinned }),
      });
      setMessage('Оголошення опубліковано');
      setAnnTitle('');
      setAnnBody('');
      setAnnPinned(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleRequestStatus(id: string, status: string) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/communications/requests/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handlePoll(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    const options = pollOptions.filter((o) => o.trim());
    if (options.length < 2) {
      setError('Потрібно щонайменше 2 варіанти');
      return;
    }
    setError('');
    try {
      await apiFetch('/communications/polls', {
        method: 'POST',
        token,
        body: JSON.stringify({ question: pollQuestion, options }),
      });
      setMessage('Опитування створено');
      setPollQuestion('');
      setPollOptions(['', '']);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function closePoll(id: string) {
    const token = getToken();
    if (!token) return;
    await apiFetch(`/communications/polls/${id}/close`, { method: 'PATCH', token });
    await load();
  }

  const sections: { id: Section; label: string }[] = [
    { id: 'announcements', label: 'Оголошення' },
    { id: 'requests', label: `Заявки (${requests.filter((r) => r.status === 'new').length})` },
    { id: 'polls', label: 'Опитування' },
  ];

  return (
    <main>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>Комунікації</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>Оголошення, заявки мешканців, опитування</p>

      <nav style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            style={{
              background: section === s.id ? 'var(--primary)' : 'var(--surface-2)',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)', marginBottom: '1rem' }}>{message}</p>}

      {section === 'announcements' && (
        <>
          <form onSubmit={handleAnnouncement} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
            <h2>Нове оголошення</h2>
            <div>
              <label>Заголовок</label>
              <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required />
            </div>
            <div>
              <label>Текст</label>
              <textarea rows={4} value={annBody} onChange={(e) => setAnnBody(e.target.value)} required />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} />
              Закріпити зверху
            </label>
            <button type="submit">Опублікувати</button>
          </form>
          <section className="card">
            <h2 style={{ marginBottom: '1rem' }}>Опубліковані ({announcements.length})</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
              {announcements.map((a) => (
                <li key={a.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {a.isPinned && '📌 '}{a.title}
                      </div>
                      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.25rem 0' }}>{a.body}</p>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                        {a.author.firstName} {a.author.lastName} ·{' '}
                        {new Date(a.createdAt).toLocaleDateString('uk-UA')}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={async () => {
                        if (!window.confirm('Видалити оголошення?')) return;
                        const token = getToken();
                        if (!token) return;
                        try {
                          await apiFetch(`/communications/announcements/${a.id}`, {
                            method: 'DELETE',
                            token,
                          });
                          await load();
                          setMessage('Оголошення видалено');
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Помилка');
                        }
                      }}
                    >
                      Видалити
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {section === 'requests' && (
        <section>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
            Заявки мешканців ({requests.length})
          </h2>
          {requests.length === 0 ? (
            <div className="card">
              <p style={{ color: 'var(--muted)' }}>Заявок немає</p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              }}
            >
              {(['new', 'in_progress', 'done'] as const).map((status) => {
                const col = requests.filter((r) => r.status === status);
                return (
                  <div key={status} className="card" style={{ minHeight: 120 }}>
                    <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                      {STATUS_LABELS[status]} ({col.length})
                    </h3>
                    <ul style={{ listStyle: 'none', display: 'grid', gap: '0.65rem' }}>
                      {col.map((r) => (
                        <li
                          key={r.id}
                          style={{
                            padding: '0.65rem',
                            background: 'var(--surface-2)',
                            borderRadius: 8,
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.title}</div>
                          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0.25rem 0' }}>
                            {r.description.slice(0, 120)}
                            {r.description.length > 120 ? '…' : ''}
                          </p>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {r.author.firstName} {r.author.lastName} ·{' '}
                            {REQUEST_CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
                          </div>
                          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            {status === 'new' && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => handleRequestStatus(r.id, 'in_progress')}
                              >
                                В роботу
                              </button>
                            )}
                            {status === 'in_progress' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => handleRequestStatus(r.id, 'done')}
                                >
                                  Виконано
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => handleRequestStatus(r.id, 'new')}
                                >
                                  Повернути
                                </button>
                              </>
                            )}
                            {status === 'done' && (
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => handleRequestStatus(r.id, 'in_progress')}
                              >
                                Знову в роботу
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                      {col.length === 0 && (
                        <li style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Порожньо</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {section === 'polls' && (
        <>
          <form onSubmit={handlePoll} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
            <h2>Нове опитування</h2>
            <div>
              <label>Питання</label>
              <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} required />
            </div>
            {pollOptions.map((opt, i) => (
              <div key={i}>
                <label>Варіант {i + 1}</label>
                <input
                  value={opt}
                  onChange={(e) => {
                    const next = [...pollOptions];
                    next[i] = e.target.value;
                    setPollOptions(next);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              style={{ background: 'var(--surface-2)', fontSize: '0.85rem' }}
              onClick={() => setPollOptions([...pollOptions, ''])}
            >
              + Варіант
            </button>
            <button type="submit">Створити</button>
          </form>
          <section className="card">
            <h2 style={{ marginBottom: '1rem' }}>Опитування ({polls.length})</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '1rem' }}>
              {polls.map((p) => (
                <li key={p.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                    {p.question}
                    {!p.isActive && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (закрито)</span>}
                  </div>
                  <ul style={{ listStyle: 'none', display: 'grid', gap: '0.35rem', marginBottom: '0.5rem' }}>
                    {p.options.map((o) => (
                      <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>{o.text}</span>
                        <span style={{ color: 'var(--muted)' }}>{o._count.votes} гол.</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Всього: {p._count.votes} голосів
                    {p.isActive && (
                      <button
                        type="button"
                        onClick={() => closePoll(p.id)}
                        style={{ marginLeft: '0.75rem', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                      >
                        Закрити
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
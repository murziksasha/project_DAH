'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
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
  _count?: { votes: number };
  voteCount?: number;
  weightSum?: number;
}

interface Poll {
  id: string;
  question: string;
  isActive: boolean;
  endsAt: string | null;
  options: PollOption[];
  _count: { votes: number };
  voteWeight?: string;
  stats?: {
    participationPercent: number;
    quorumPercent: number | null;
    quorumMet: boolean;
  };
}

type Section = 'announcements' | 'requests' | 'polls';

export default function CommunicationsPage() {
  const { t, locale } = useI18n();
  const STATUS_LABELS: Record<string, string> = {
    new: t('commsStatusNew'),
    in_progress: t('commsStatusProgress'),
    done: t('commsStatusDone'),
  };
  const REQUEST_CATEGORIES = [
    { value: 'sanitary', label: t('commsCatSanitary') },
    { value: 'electric', label: t('commsCatElectric') },
    { value: 'cleaning', label: t('commsCatCleaning') },
    { value: 'other', label: t('commsCatOther') },
  ];
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
  const [pollWeight, setPollWeight] = useState<'one_per_user' | 'one_per_apartment' | 'by_area'>(
    'one_per_user',
  );
  const [pollQuorum, setPollQuorum] = useState('');

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
      setMessage(t('commsAnnCreated'));
      setAnnTitle('');
      setAnnBody('');
      setAnnPinned(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
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
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function handlePoll(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    const options = pollOptions.filter((o) => o.trim());
    if (options.length < 2) {
      setError(t('commsMinOptions'));
      return;
    }
    setError('');
    try {
      await apiFetch('/communications/polls', {
        method: 'POST',
        token,
        body: JSON.stringify({
          question: pollQuestion,
          options,
          voteWeight: pollWeight,
          quorumPercent: pollQuorum ? Number(pollQuorum) : undefined,
        }),
      });
      setMessage(t('commsPollCreated'));
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollWeight('one_per_user');
      setPollQuorum('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function closePoll(id: string) {
    const token = getToken();
    if (!token) return;
    await apiFetch(`/communications/polls/${id}/close`, { method: 'PATCH', token });
    await load();
  }

  const sections: { id: Section; label: string }[] = [
    { id: 'announcements', label: t('commsAnnouncements') },
    {
      id: 'requests',
      label: `${t('commsRequests')} (${requests.filter((r) => r.status === 'new').length})`,
    },
    { id: 'polls', label: t('commsPolls') },
  ];
  const dateLocale = locale === 'ru' ? 'ru-RU' : 'uk-UA';

  return (
    <main>
      <h1 style={{ margin: '1rem 0 0.5rem' }}>{t('commsPageTitle')}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>{t('commsDesc')}</p>

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
            <h2>{t('commsNewAnnouncement')}</h2>
            <div>
              <label>{t('commsAnnTitle')}</label>
              <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required />
            </div>
            <div>
              <label>{t('commsAnnBody')}</label>
              <textarea rows={4} value={annBody} onChange={(e) => setAnnBody(e.target.value)} required />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} />
              {t('commsPin')}
            </label>
            <button type="submit">{t('commsPublish')}</button>
          </form>
          <section className="card">
            <h2 style={{ marginBottom: '1rem' }}>
              {t('commsPublished', { count: announcements.length })}
            </h2>
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
                        {new Date(a.createdAt).toLocaleDateString(dateLocale)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={async () => {
                        if (!window.confirm(t('commsDeleteConfirm'))) return;
                        const token = getToken();
                        if (!token) return;
                        try {
                          await apiFetch(`/communications/announcements/${a.id}`, {
                            method: 'DELETE',
                            token,
                          });
                          await load();
                          setMessage(t('commsAnnDeleted'));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t('error'));
                        }
                      }}
                    >
                      {t('delete')}
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
            {t('commsRequestsHeading', { count: requests.length })}
          </h2>
          {requests.length === 0 ? (
            <div className="card">
              <p style={{ color: 'var(--muted)' }}>{t('commsNoRequests')}</p>
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
                                {t('commsToProgress')}
                              </button>
                            )}
                            {status === 'in_progress' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => handleRequestStatus(r.id, 'done')}
                                >
                                  {t('commsMarkDone')}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => handleRequestStatus(r.id, 'new')}
                                >
                                  {t('commsReturn')}
                                </button>
                              </>
                            )}
                            {status === 'done' && (
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() => handleRequestStatus(r.id, 'in_progress')}
                              >
                                {t('commsAgain')}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                      {col.length === 0 && (
                        <li style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{t('commsEmpty')}</li>
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
            <h2>{t('commsNewPoll')}</h2>
            <div>
              <label>{t('commsPollQuestion')}</label>
              <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} required />
            </div>
            <div>
              <label>{t('commsVoteWeight')}</label>
              <select
                value={pollWeight}
                onChange={(e) =>
                  setPollWeight(e.target.value as 'one_per_user' | 'one_per_apartment' | 'by_area')
                }
              >
                <option value="one_per_user">{t('commsWeightUser')}</option>
                <option value="one_per_apartment">{t('commsWeightApt')}</option>
                <option value="by_area">{t('commsWeightArea')}</option>
              </select>
            </div>
            <div>
              <label>{t('commsQuorum')}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={pollQuorum}
                onChange={(e) => setPollQuorum(e.target.value)}
                placeholder="50"
              />
            </div>
            {pollOptions.map((opt, i) => (
              <div key={i}>
                <label>{t('commsOptionN', { n: i + 1 })}</label>
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
              {t('commsAddOption')}
            </button>
            <button type="submit">{t('create')}</button>
          </form>
          <section className="card">
            <h2 style={{ marginBottom: '1rem' }}>{t('commsPollsCount', { count: polls.length })}</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '1rem' }}>
              {polls.map((p) => (
                <li key={p.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                    {p.question}
                    {!p.isActive && (
                      <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                        {' '}
                        {t('commsPollClosed')}
                      </span>
                    )}
                  </div>
                  <ul style={{ listStyle: 'none', display: 'grid', gap: '0.35rem', marginBottom: '0.5rem' }}>
                    {p.options.map((o) => (
                      <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>{o.text}</span>
                        <span style={{ color: 'var(--muted)' }}>
                          {o.voteCount ?? o._count?.votes ?? 0}
                          {o.weightSum != null
                            ? t('commsWeightSum', { w: o.weightSum })
                            : t('commsVotesShort')}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {t('commsVotesTotal', { count: p._count.votes })}
                    {p.isActive && (
                      <button
                        type="button"
                        onClick={() => closePoll(p.id)}
                        style={{ marginLeft: '0.75rem', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                      >
                        {t('close')}
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
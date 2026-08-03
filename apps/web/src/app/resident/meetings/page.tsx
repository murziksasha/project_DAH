'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';

interface MeetingListItem {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
}

interface AgendaView {
  id: string;
  title: string;
  options: unknown;
  totals: Record<string, number>;
  myVote: string | null;
}

interface MeetingDetail {
  id: string;
  title: string;
  status: string;
  agendaItems: AgendaView[];
  stats: { participants: number; signedCount: number };
}

export default function ResidentMeetingsPage() {
  const [list, setList] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setList(await apiFetch<MeetingListItem[]>('/meetings', { token }));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function open(id: string) {
    const token = getToken();
    if (!token) return;
    setSelected(await apiFetch<MeetingDetail>(`/meetings/${id}`, { token }));
  }

  async function register() {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    await apiFetch(`/meetings/${selected.id}/register`, { method: 'POST', token, body: '{}' });
    setMessage('Зареєстровано на збори');
    await open(selected.id);
  }

  async function vote(agendaItemId: string, optionKey: string) {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    await apiFetch(`/meetings/${selected.id}/agenda/${agendaItemId}/vote`, {
      method: 'POST',
      token,
      body: JSON.stringify({ optionKey }),
    });
    await open(selected.id);
  }

  async function sign(provider?: string) {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    const res = await apiFetch<{
      sessionId: string;
      signed: boolean;
      provider: string;
      authorizeUrl?: string | null;
      deeplink?: string | null;
      message?: string;
    }>(`/meetings/${selected.id}/sign`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        provider,
        returnUrl: `${window.location.origin}/resident/meetings`,
      }),
    });
    if (res.signed) {
      setMessage(`Підписано (${res.provider})`);
      await open(selected.id);
      return;
    }
    const url = res.authorizeUrl || res.deeplink;
    if (url) {
      window.open(url, 'kep-sign', 'width=480,height=720');
      setMessage(res.message ?? 'Підпишіть у вікні Дія/КЕП…');
      const sessionId = res.sessionId;
      const started = Date.now();
      const poll = async () => {
        if (Date.now() - started > 5 * 60 * 1000) return;
        try {
          const s = await apiFetch<{ signed: boolean }>(`/kep/sessions/${sessionId}`, { token });
          if (s.signed) {
            setMessage('Підпис отримано');
            await open(selected.id);
            return;
          }
        } catch {
          /* ignore */
        }
        setTimeout(poll, 2000);
      };
      setTimeout(poll, 1500);
      return;
    }
    setMessage(res.message ?? 'Сесію створено');
  }

  return (
    <main style={{ display: 'grid', gap: '1rem' }}>
      <PageHeader
        title="Збори"
        description="Реєстрація, голосування, електронний підпис"
      />
      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      <section className="card">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" className="btn btn-ghost" onClick={() => open(m.id)}>
                {m.title} · {m.status}
              </button>
            </li>
          ))}
          {!list.length && <li style={{ color: 'var(--muted)' }}>Немає активних зборів</li>}
        </ul>
      </section>

      {selected && (
        <section className="card" style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{selected.title}</h2>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            {selected.status} · учасників {selected.stats.participants} · підписів{' '}
            {selected.stats.signedCount}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => register()}>
              Зареєструватись
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => sign()}>
              Підписати КЕП / Дія
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => sign('mock')}>
              Demo mock
            </button>
          </div>
          {selected.agendaItems.map((item) => {
            const opts = Array.isArray(item.options)
              ? (item.options as string[])
              : ['За', 'Проти', 'Утримався'];
            return (
              <div key={item.id}>
                <strong>{item.title}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {item.myVote ? `Ваш голос: ${item.myVote}` : 'Ще не голосували'}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {opts.map((o) => (
                    <button
                      key={o}
                      type="button"
                      className="btn btn-sm"
                      disabled={selected.status !== 'open'}
                      onClick={() => vote(item.id, o)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { apiFetch, getToken } from '@/lib/api';

interface MeetingListItem {
  id: string;
  title: string;
  status: string;
  type: string;
  scheduledAt: string | null;
  _count?: { participants: number; signatures: number };
}

interface AgendaView {
  id: string;
  title: string;
  options: string[] | unknown;
  totals: Record<string, number>;
  totalWeight: number;
  myVote: string | null;
}

interface MeetingDetail {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  protocolText?: string | null;
  agendaItems: AgendaView[];
  stats: { participants: number; signedCount: number };
}

export default function MeetingsPage() {
  const [list, setList] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [agendaTitle, setAgendaTitle] = useState('Затвердження звіту');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    const data = await apiFetch<MeetingListItem[]>('/meetings', { token });
    setList(data);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function openMeeting(id: string) {
    const token = getToken();
    if (!token) return;
    const data = await apiFetch<MeetingDetail>(`/meetings/${id}`, { token });
    setSelected(data);
  }

  async function createMeeting(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      const m = await apiFetch<MeetingListItem>('/meetings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title,
          type: 'general',
          scheduledAt: new Date().toISOString(),
          quorumPercent: 50,
          agenda: agendaTitle ? [{ title: agendaTitle }] : [],
        }),
      });
      setTitle('');
      setMessage('Збори створено (draft)');
      await load();
      await openMeeting(m.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function setStatus(status: string) {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    await apiFetch(`/meetings/${selected.id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    });
    setMessage(`Статус: ${status}`);
    await openMeeting(selected.id);
    await load();
  }

  async function register() {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    await apiFetch(`/meetings/${selected.id}/register`, { method: 'POST', token, body: '{}' });
    setMessage('Зареєстровано');
    await openMeeting(selected.id);
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
    await openMeeting(selected.id);
  }

  async function sign(provider?: string) {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    const res = await apiFetch<{
      sessionId: string;
      provider: string;
      status: string;
      signed: boolean;
      authorizeUrl?: string | null;
      deeplink?: string | null;
      message?: string;
    }>(`/meetings/${selected.id}/sign`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        provider: provider || undefined,
        returnUrl: `${window.location.origin}/admin/meetings`,
      }),
    });

    if (res.signed) {
      setMessage(`Підписано (${res.provider})`);
      await openMeeting(selected.id);
      return;
    }

    const openUrl = res.authorizeUrl || res.deeplink;
    if (openUrl) {
      window.open(openUrl, 'kep-sign', 'width=480,height=720');
      setMessage(res.message ?? 'Відкрито вікно підпису… очікуємо');
      // Poll session until signed
      const sessionId = res.sessionId;
      const started = Date.now();
      const poll = async () => {
        if (Date.now() - started > 5 * 60 * 1000) return;
        try {
          const s = await apiFetch<{ signed: boolean; status: string }>(
            `/kep/sessions/${sessionId}`,
            { token },
          );
          if (s.signed) {
            setMessage('КЕП: документ підписано');
            await openMeeting(selected.id);
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

    setMessage(res.message ?? `Сесія ${res.sessionId}: ${res.status}`);
    await openMeeting(selected.id);
  }

  async function protocol() {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    await apiFetch(`/meetings/${selected.id}/protocol`, { method: 'POST', token, body: '{}' });
    setMessage('Протокол згенеровано');
    await openMeeting(selected.id);
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <PageHeader
        title="Збори + КЕП"
        subtitle="Загальні збори: порядок денний, голосування, підпис (mock / КЕП / Дія)"
      />
      {error && <p className="error">{error}</p>}
      {message && <p style={{ color: 'var(--success)' }}>{message}</p>}

      <form className="card" onSubmit={createMeeting} style={{ display: 'grid', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Нові збори</h2>
        <input
          placeholder="Назва"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          placeholder="Питання порядку денного"
          value={agendaTitle}
          onChange={(e) => setAgendaTitle(e.target.value)}
        />
        <button type="submit">Створити draft</button>
      </form>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2 style={{ fontSize: '1.05rem' }}>Список</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => openMeeting(m.id).catch((e) => setError(e.message))}
                >
                  <strong>{m.title}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {m.status} · учасн. {m._count?.participants ?? 0} · підписів{' '}
                    {m._count?.signatures ?? 0}
                  </div>
                </button>
              </li>
            ))}
            {!list.length && <li style={{ color: 'var(--muted)' }}>Поки немає зборів</li>}
          </ul>
        </section>

        {selected && (
          <section className="card" style={{ display: 'grid', gap: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>{selected.title}</h2>
            <div style={{ color: 'var(--muted)' }}>
              Статус: <strong>{selected.status}</strong> · учасників{' '}
              {selected.stats.participants} · підписів {selected.stats.signedCount}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" onClick={() => setStatus('scheduled')}>
                scheduled
              </button>
              <button type="button" onClick={() => setStatus('open')}>
                Відкрити
              </button>
              <button type="button" onClick={() => setStatus('closed')}>
                Закрити
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => register()}>
                Зареєструватись
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => sign()}>
                Підписати (KEP_PROVIDER)
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => sign('mock')}>
                Mock КЕП
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => sign('diia')}>
                Дія.Підпис
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => sign('cades')}>
                CAdES (digest)
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => protocol()}>
                Протокол
              </button>
            </div>

            {selected.agendaItems.map((item) => {
              const opts = Array.isArray(item.options)
                ? (item.options as string[])
                : ['За', 'Проти', 'Утримався'];
              return (
                <div key={item.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <strong>{item.title}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {Object.entries(item.totals || {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ') || 'Голосів ще немає'}
                    {item.myVote ? ` · ваш: ${item.myVote}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                    {opts.map((o) => (
                      <button key={o} type="button" className="btn btn-sm" onClick={() => vote(item.id, o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {selected.protocolText && (
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.85rem',
                  background: 'var(--surface-2)',
                  padding: '0.75rem',
                  borderRadius: 8,
                }}
              >
                {selected.protocolText}
              </pre>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

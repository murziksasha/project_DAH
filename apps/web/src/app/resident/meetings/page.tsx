'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { apiFetch, getToken } from '@/lib/api';
import { formatDateUk } from '@/lib/money';

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

function statusTone(status: string): 'muted' | 'success' | 'danger' | 'primary' | 'warning' {
  if (status === 'open' || status === 'voting') return 'primary';
  if (status === 'closed' || status === 'done') return 'muted';
  if (status === 'draft') return 'warning';
  return 'muted';
}

export default function ResidentMeetingsPage() {
  const { t } = useI18n();
  const [list, setList] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      draft: t('meetingStatusDraft'),
      open: t('meetingStatusOpen'),
      voting: t('meetingStatusVoting'),
      closed: t('meetingStatusClosed'),
      done: t('meetingStatusDone'),
    };
    return map[s] ?? s;
  };

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    try {
      setList(await apiFetch<MeetingListItem[]>('/meetings', { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    const token = getToken();
    if (!token) return;
    setError('');
    setBusy(true);
    try {
      setSelected(await apiFetch<MeetingDetail>(`/meetings/${id}`, { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/meetings/${selected.id}/register`, {
        method: 'POST',
        token,
        body: '{}',
      });
      setMessage(t('meetingRegistered'));
      await open(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function vote(agendaItemId: string, optionKey: string) {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/meetings/${selected.id}/agenda/${agendaItemId}/vote`, {
        method: 'POST',
        token,
        body: JSON.stringify({ optionKey }),
      });
      setMessage(t('residentVoteCounted'));
      await open(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function sign(provider?: string) {
    if (!selected) return;
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
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
        setMessage(t('meetingSigned', { provider: res.provider }));
        await open(selected.id);
        return;
      }
      const url = res.authorizeUrl || res.deeplink;
      if (url) {
        window.open(url, 'kep-sign', 'width=480,height=720');
        setMessage(res.message ?? t('meetingSignWindow'));
        const sessionId = res.sessionId;
        const started = Date.now();
        const poll = async () => {
          if (Date.now() - started > 5 * 60 * 1000) return;
          try {
            const s = await apiFetch<{ signed: boolean }>(`/kep/sessions/${sessionId}`, {
              token,
            });
            if (s.signed) {
              setMessage(t('meetingSignReceived'));
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
      setMessage(res.message ?? t('meetingSessionCreated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="resident-meetings">
      <Link href="/resident" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        {t('residentBackCabinet')}
      </Link>
      <PageHeader title={t('residentMeetingsTitle')} description={t('residentMeetingsDesc')} />
      {error && <p className="error">{error}</p>}
      {message && <p className="success-banner">{message}</p>}
      {loading && <SkeletonCards count={1} />}

      {!loading && list.length === 0 && (
        <EmptyState title={t('residentMeetingsEmpty')} description={t('residentMeetingsEmptyDesc')} />
      )}

      {!loading && list.length > 0 && (
        <section className="card">
          <h2 className="resident-section-title">{t('residentMeetingsList')}</h2>
          <ul className="resident-meeting-list">
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`resident-meeting-item${selected?.id === m.id ? ' active' : ''}`}
                  onClick={() => void open(m.id)}
                  disabled={busy}
                >
                  <span className="resident-meeting-title">{m.title}</span>
                  <span className="resident-meeting-meta">
                    <Badge tone={statusTone(m.status)}>{statusLabel(m.status)}</Badge>
                    {m.scheduledAt && (
                      <span className="resident-muted resident-sm">
                        {formatDateUk(m.scheduledAt)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <section className="card resident-meeting-detail">
          <div className="resident-meeting-detail-head">
            <h2 style={{ margin: 0 }}>{selected.title}</h2>
            <Badge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge>
          </div>
          <p className="resident-muted" style={{ margin: 0 }}>
            {t('residentMeetingStats', {
              participants: selected.stats.participants,
              signed: selected.stats.signedCount,
            })}
          </p>
          <div className="resident-meeting-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void register()}>
              {t('meetingRegister')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void sign()}
            >
              {t('meetingSignKep')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void sign('mock')}
            >
              {t('meetingSignDemo')}
            </button>
          </div>

          {selected.agendaItems.length === 0 ? (
            <p className="resident-muted">{t('residentMeetingNoAgenda')}</p>
          ) : (
            selected.agendaItems.map((item) => {
              const opts = Array.isArray(item.options)
                ? (item.options as string[])
                : [t('meetingVoteFor'), t('meetingVoteAgainst'), t('meetingVoteAbstain')];
              const canVote = selected.status === 'open' || selected.status === 'voting';
              return (
                <div key={item.id} className="resident-agenda-item">
                  <strong>{item.title}</strong>
                  <div className="resident-muted resident-sm">
                    {item.myVote
                      ? t('residentMeetingYourVote', { vote: item.myVote })
                      : t('residentMeetingNotVoted')}
                  </div>
                  <div className="resident-agenda-votes">
                    {opts.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={`btn btn-sm${item.myVote === o ? '' : ' btn-ghost'}`}
                        disabled={!canVote || busy || !!item.myVote}
                        onClick={() => void vote(item.id, o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </main>
  );
}

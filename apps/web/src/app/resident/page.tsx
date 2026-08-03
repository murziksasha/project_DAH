'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, downloadReceipt, getToken } from '@/lib/api';
import { formatDateUk, formatMoney } from '@/lib/money';
import { AccountTab, type ResidentAccount } from './_components/AccountTab';

type Tab = 'account' | 'building' | 'documents' | 'debtors' | 'communications';

type Account = ResidentAccount;

interface BankAccount {
  id: string;
  bankName: string;
  iban: string;
  description: string | null;
}

interface Transparency {
  building: {
    name: string;
    address?: string;
    edrpou?: string | null;
    showDebtorsToResidents: boolean;
    showBankDetailsToResidents?: boolean;
  } | null;
  expenseSummary: {
    total: number;
    byCategory: Array<{ name: string; total: number }>;
    byFund: Array<{ name: string; total: number }>;
  };
  cashFlow: {
    totalIncome: number;
    totalExpenses: number;
    netFlow: number;
    fundBalances: Array<{ fundName: string; balance: number }>;
  };
  documents: Array<{ id: string; title: string; description: string | null; fileUrl: string }>;
  debtors: Array<{ number: string; debt: number; isOverdue: boolean }> | null;
  bankAccounts: BankAccount[] | null;
}

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
  userVote?: string | null;
  voteWeight?: string;
  stats?: {
    participationPercent: number;
    quorumPercent: number | null;
    quorumMet: boolean;
    votedWeight: number;
    eligibleWeight: number;
  };
}

export default function ResidentPage() {
  const { t } = useI18n();
  const REQUEST_STATUS: Record<string, string> = {
    new: t('commsStatusNew'),
    in_progress: t('commsStatusProgress'),
    done: t('commsStatusDone'),
  };
  const TABS: { id: Tab; label: string }[] = [
    { id: 'account', label: t('residentTabAccount') },
    { id: 'communications', label: t('residentTabNews') },
    { id: 'building', label: t('residentTabTransparency') },
    { id: 'documents', label: t('residentTabDocs') },
    { id: 'debtors', label: t('residentTabDebtors') },
  ];
  const [tab, setTab] = useState<Tab>('account');
  const [account, setAccount] = useState<Account | null>(null);
  const [transparency, setTransparency] = useState<Transparency | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [userName, setUserName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reqTitle, setReqTitle] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqCategory, setReqCategory] = useState('other');
  const [commsMessage, setCommsMessage] = useState('');
  const [copied, setCopied] = useState('');
  const [onlinePayEnabled, setOnlinePayEnabled] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [tabSearch, setTabSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab') as Tab | null;
    if (urlTab && TABS.some((t) => t.id === urlTab)) setTab(urlTab);

    const token = getToken();
    const userRaw = localStorage.getItem('dah_user');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    if (userRaw) {
      const user = JSON.parse(userRaw);
      setUserName(`${user.firstName} ${user.lastName}`);
    }

    Promise.all([
      apiFetch<Account>('/accruals/my-account', { token }),
      apiFetch<Transparency>('/transparency/dashboard', { token }),
      apiFetch<Announcement[]>('/communications/announcements', { token }),
      apiFetch<RequestItem[]>('/communications/requests', { token }),
      apiFetch<Poll[]>('/communications/polls', { token }),
      apiFetch<{ enabled: boolean }>('/payments/online/status', { skipAuth: true }).catch(() => ({
        enabled: false,
      })),
    ])
      .then(([a, t, ann, req, pol, pay]) => {
        setAccount(a);
        setTransparency(t);
        setAnnouncements(ann);
        setRequests(req);
        setPolls(pol);
        setOnlinePayEnabled(Boolean(pay?.enabled));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const paymentPurpose = useMemo(() => {
    if (!account) return 'Оплата внесків, Мій дім';
    return `Оплата внесків, кв. ${account.apartment.number}`;
  }, [account]);

  const openLineForReceipt = useMemo(() => {
    if (!account?.lines?.length) return null;
    return (
      account.lines.find((l) => l.balance > 0) ??
      account.lines[0]
    );
  }, [account]);

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      await apiFetch('/communications/requests', {
        method: 'POST',
        token,
        body: JSON.stringify({ title: reqTitle, description: reqDesc, category: reqCategory }),
      });
      setCommsMessage(t('residentRequestSent'));
      setReqTitle('');
      setReqDesc('');
      const updated = await apiFetch<RequestItem[]>('/communications/requests', { token });
      setRequests(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function handleVote(pollId: string, optionId: string) {
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      const updated = await apiFetch<Poll>(`/communications/polls/${pollId}/vote`, {
        method: 'POST',
        token,
        body: JSON.stringify({ optionId }),
      });
      setPolls((prev) => prev.map((p) => (p.id === pollId ? { ...updated, userVote: optionId } : p)));
      setCommsMessage(t('residentVoteCounted'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function handleReceipt(lineId: string) {
    const token = getToken();
    if (!token) return;
    try {
      await downloadReceipt(lineId, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Не вдалося скопіювати');
    }
  }

  const q = tabSearch.trim().toLowerCase();
  const filteredAnnouncements = useMemo(() => {
    if (!q) return announcements;
    return announcements.filter(
      (a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q),
    );
  }, [announcements, q]);
  const filteredDocs = useMemo(() => {
    const docs = transparency?.documents ?? [];
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.description ?? '').toLowerCase().includes(q),
    );
  }, [transparency?.documents, q]);
  const filteredDebtors = useMemo(() => {
    const list = transparency?.debtors ?? [];
    if (!q) return list;
    return list.filter((d) => d.number.toLowerCase().includes(q));
  }, [transparency?.debtors, q]);
  const filteredCategories = useMemo(() => {
    const list = transparency?.expenseSummary.byCategory ?? [];
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [transparency?.expenseSummary.byCategory, q]);

  async function handleOnlinePay() {
    const token = getToken();
    if (!token || !account) return;
    const amount = account.summary.debt;
    if (amount <= 0) {
      setError('Немає боргу для оплати');
      return;
    }
    // apartment id from user storage
    const raw = localStorage.getItem('dah_user');
    let apartmentId = '';
    try {
      apartmentId = raw ? (JSON.parse(raw) as { apartmentId?: string }).apartmentId ?? '' : '';
    } catch {
      apartmentId = '';
    }
    if (!apartmentId) {
      setError('Квартиру не привʼязано');
      return;
    }
    setPayBusy(true);
    setError('');
    try {
      const status = await apiFetch<{
        enabled: boolean;
        sandbox: boolean;
        productionReady?: boolean;
      }>('/payments/online/status', { skipAuth: true });

      // Production / real provider: open checkout form first
      if (!status.sandbox) {
        const intent = await apiFetch<{
          checkoutUrl: string;
          orderId: string;
          message?: string;
          formAction?: string;
          form?: Record<string, string>;
        }>('/payments/online/intent', {
          method: 'POST',
          token,
          body: JSON.stringify({ apartmentId, amount }),
        });
        if (intent.formAction && intent.form) {
          const f = document.createElement('form');
          f.method = 'POST';
          f.action = intent.formAction;
          f.acceptCharset = 'utf-8';
          for (const [k, v] of Object.entries(intent.form)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = k;
            input.value = v;
            f.appendChild(input);
          }
          document.body.appendChild(f);
          f.submit();
          return;
        }
        setCommsMessage(intent.message ?? `Замовлення ${intent.orderId}`);
        if (intent.checkoutUrl) {
          window.open(intent.checkoutUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      // Sandbox / generic: immediate complete for local demos
      const paid = await apiFetch<{
        ok: boolean;
        paymentId?: string;
        orderId?: string;
        sandbox?: boolean;
      }>('/payments/online/sandbox-complete', {
        method: 'POST',
        token,
        body: JSON.stringify({ apartmentId, amount }),
      });
      setCommsMessage(
        paid.ok
          ? `Оплату зараховано${paid.sandbox ? ' (sandbox)' : ''}: ${paid.paymentId?.slice(-8) ?? paid.orderId}`
          : 'Платіж не створено',
      );
      const refreshed = await apiFetch<Account>('/accruals/my-account', { token });
      setAccount(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка онлайн-оплати');
    } finally {
      setPayBusy(false);
    }
  }

  const visibleTabs = TABS.filter(
    (t) => t.id !== 'debtors' || transparency?.debtors !== null,
  );

  const debt = account?.summary.debt ?? 0;
  const advance = account?.summary.advance ?? 0;
  const heroTone = debt > 0 ? 'var(--danger)' : 'var(--success)';
  const heroLabel =
    debt > 0 ? t('residentToPay') : advance > 0 ? t('residentOverpay') : t('residentNoDebt');
  const heroAmount = debt > 0 ? debt : advance > 0 ? advance : 0;

  return (
    <main>
      <PageHeader
        title={t('residentCabinetTitle')}
        description={
          userName || account
            ? [
                userName && t('residentWelcome', { name: userName }),
                account && t('residentApt', { number: account.apartment.number }),
              ]
                .filter(Boolean)
                .join(' · ')
            : t('residentCabinetDesc')
        }
      />

      {error && <p className="error" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      {loading && <SkeletonCards count={2} />}

      {!loading && account && (
        <section className="resident-hero">
          <div className="resident-hero-label">{heroLabel}</div>
          <div className="resident-hero-amount" style={{ color: heroTone }}>
            {formatMoney(heroAmount)}
          </div>
          <div className="resident-hero-actions">
            {openLineForReceipt && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleReceipt(openLineForReceipt.id)}
              >
                {t('residentPdfReceipt')}
              </button>
            )}
            {onlinePayEnabled && debt > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={payBusy}
                onClick={() => void handleOnlinePay()}
              >
                {payBusy ? t('residentPaying') : t('residentPayOnline')}
              </button>
            )}
            {transparency?.bankAccounts && transparency.bankAccounts.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setTab('account');
                  document.getElementById('bank-details')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {t('residentBankDetails')}
              </button>
            )}
          </div>
        </section>
      )}

      <nav className="nav-scroll resident-tabs" aria-label="Розділи кабінету">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => {
              setTab(t.id);
              setTabSearch('');
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== 'account' && (
        <div className="resident-tab-search card">
          <label htmlFor="tab-search" className="sr-only">
            Пошук
          </label>
          <input
            id="tab-search"
            type="search"
            placeholder={
              tab === 'communications'
                ? t('residentSearchAnn')
                : tab === 'documents'
                  ? t('residentSearchDocs')
                  : tab === 'debtors'
                    ? t('residentSearchApt')
                    : t('residentSearchCat')
            }
            value={tabSearch}
            onChange={(e) => setTabSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
      )}

      {tab === 'account' && !loading && account && (
        <AccountTab
          account={account}
          bankAccounts={transparency?.bankAccounts}
          buildingEdrpou={transparency?.building?.edrpou}
          paymentPurpose={paymentPurpose}
          onReceipt={(id) => void handleReceipt(id)}
          copied={copied}
          onCopy={(label, text) => void copyText(label, text)}
        />
      )}

      {tab === 'building' && !loading && transparency && (
        <section>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <StatCard label={t('residentOrgExpenses')} value={formatMoney(transparency.expenseSummary.total)} tone="danger" />
            <StatCard label={t('dashIncome')} value={formatMoney(transparency.cashFlow.totalIncome)} tone="success" />
          </div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('residentByCategory')}</h2>
            {filteredCategories.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('noData')}</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
                {filteredCategories.map((c) => (
                  <li key={c.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.name}</span>
                    <span style={{ fontWeight: 600 }}>{formatMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('residentFundBalances')}</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
              {transparency.cashFlow.fundBalances.map((f) => (
                <li key={f.fundName} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{f.fundName}</span>
                  <span style={{ fontWeight: 600 }}>{formatMoney(f.balance)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tab === 'communications' && !loading && (
        <section>
          {commsMessage && <p className="success-banner">{commsMessage}</p>}

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('commsAnnouncements')}</h2>
            {filteredAnnouncements.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>
                {announcements.length === 0 ? t('residentNoAnnouncements') : t('residentNothingFound')}
              </p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {filteredAnnouncements.map((a) => (
                  <li key={a.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600 }}>{a.isPinned && '📌 '}{a.title}</div>
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.25rem 0' }}>{a.body}</p>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {formatDateUk(a.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('commsPolls')}</h2>
            {polls.filter((p) => p.isActive).length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('residentNoActivePolls')}</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '1rem' }}>
                {polls.filter((p) => p.isActive).map((p) => (
                  <li key={p.id}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{p.question}</div>
                    <ul style={{ listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
                      {p.options.map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={() => handleVote(p.id, o.id)}
                            disabled={!!p.userVote}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: p.userVote === o.id ? 'var(--primary)' : 'var(--surface-2)',
                              color: p.userVote === o.id ? '#fff' : 'var(--text)',
                              fontSize: '0.9rem',
                              padding: '0.5rem 0.75rem',
                            }}
                          >
                            {o.text}
                            {(o.voteCount ?? o._count?.votes ?? 0) > 0 && p._count.votes > 0 && (
                              <span style={{ float: 'right', opacity: 0.7 }}>
                                {o.weightSum != null
                                  ? `${o.weightSum}`
                                  : `${Math.round(((o.voteCount ?? o._count?.votes ?? 0) / p._count.votes) * 100)}%`}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {p.stats && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                        Явка {p.stats.participationPercent}%
                        {p.stats.quorumPercent != null
                          ? ` · кворум ${p.stats.quorumPercent}% (${p.stats.quorumMet ? 'є' : 'немає'})`
                          : ''}
                      </p>
                    )}
                    {p.userVote && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                        {t('residentThanksVote')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleRequest} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>{t('residentNewRequest')}</h2>
            <div>
              <label htmlFor="req-title">{t('residentReqSubject')}</label>
              <input id="req-title" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="req-desc">{t('residentReqDesc')}</label>
              <textarea id="req-desc" rows={3} value={reqDesc} onChange={(e) => setReqDesc(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="req-cat">{t('residentReqCategory')}</label>
              <select id="req-cat" value={reqCategory} onChange={(e) => setReqCategory(e.target.value)}>
                <option value="sanitary">{t('commsCatSanitary')}</option>
                <option value="electric">{t('commsCatElectric')}</option>
                <option value="cleaning">{t('commsCatCleaning')}</option>
                <option value="other">{t('commsCatOther')}</option>
              </select>
            </div>
            <button type="submit">{t('send')}</button>
          </form>

          {requests.length > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('residentMyRequests')}</h2>
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {requests.map((r) => (
                  <li key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {REQUEST_STATUS[r.status] ?? r.status} · {formatDateUk(r.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'documents' && !loading && transparency && (
        <section className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('residentOrgDocs')}</h2>
          {filteredDocs.length === 0 ? (
            <EmptyState
              title={
                transparency.documents.length === 0
                  ? t('residentNoPublicDocs')
                  : t('residentNothingFound')
              }
            />
          ) : (
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
              {filteredDocs.map((d) => (
                <li key={d.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                    {d.title}
                  </a>
                  {d.description && (
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{d.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'debtors' && !loading && transparency?.debtors && (
        <section className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
            {t('residentDebtorsHeading', {
              count: q
                ? `${filteredDebtors.length} / ${transparency.debtors.length}`
                : filteredDebtors.length,
            })}
          </h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('metersColApt')}</th>
                  <th>{t('debt')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredDebtors.map((d) => (
                  <tr key={d.number}>
                    <td>{d.number}</td>
                    <td>{formatMoney(d.debt)}</td>
                    <td style={{ color: d.isOverdue ? 'var(--danger)' : 'var(--muted)' }}>
                      {d.isOverdue ? t('overdue') : t('residentToPay')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

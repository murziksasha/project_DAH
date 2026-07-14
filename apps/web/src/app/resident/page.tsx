'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, downloadReceipt, getToken } from '@/lib/api';
import { formatDateUk, formatMoney } from '@/lib/money';

type Tab = 'account' | 'building' | 'documents' | 'debtors' | 'communications';

interface AccountLine {
  id: string;
  period: string;
  title: string;
  fundName: string;
  amount: number;
  paidAmount: number;
  balance: number;
  status: string;
}

interface Account {
  apartment: { number: string; buildingName: string };
  summary: { totalAccrued: number; totalPaid: number; debt: number; advance: number };
  lines: AccountLine[];
  payments: Array<{ id: string; amount: number; date: string; source: string }>;
}

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
  _count: { votes: number };
}

interface Poll {
  id: string;
  question: string;
  isActive: boolean;
  endsAt: string | null;
  options: PollOption[];
  _count: { votes: number };
  userVote?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'До сплати',
  partially_paid: 'Частково',
  paid: 'Сплачено',
  overdue: 'Прострочено',
};

const REQUEST_STATUS: Record<string, string> = {
  new: 'Нова',
  in_progress: 'В роботі',
  done: 'Виконано',
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Рахунок' },
  { id: 'communications', label: 'Новини' },
  { id: 'building', label: 'Прозорість' },
  { id: 'documents', label: 'Документи' },
  { id: 'debtors', label: 'Боржники' },
];

export default function ResidentPage() {
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
    ])
      .then(([a, t, ann, req, pol]) => {
        setAccount(a);
        setTransparency(t);
        setAnnouncements(ann);
        setRequests(req);
        setPolls(pol);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const paymentPurpose = useMemo(() => {
    if (!account) return 'Оплата внесків ОСМД';
    return `Оплата внесків ОСМД, кв. ${account.apartment.number}`;
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
      setCommsMessage('Заявку надіслано');
      setReqTitle('');
      setReqDesc('');
      const updated = await apiFetch<RequestItem[]>('/communications/requests', { token });
      setRequests(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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
      setCommsMessage('Голос зараховано');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
    }
  }

  async function handleReceipt(lineId: string) {
    const token = getToken();
    if (!token) return;
    try {
      await downloadReceipt(lineId, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
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

  const visibleTabs = TABS.filter(
    (t) => t.id !== 'debtors' || transparency?.debtors !== null,
  );

  const debt = account?.summary.debt ?? 0;
  const advance = account?.summary.advance ?? 0;
  const heroTone = debt > 0 ? 'var(--danger)' : 'var(--success)';
  const heroLabel = debt > 0 ? 'До сплати' : advance > 0 ? 'Переплата' : 'Борг відсутній';
  const heroAmount = debt > 0 ? debt : advance > 0 ? advance : 0;

  return (
    <main>
      <PageHeader
        title="Кабінет мешканця"
        description={
          userName || account
            ? [userName && `Вітаємо, ${userName}`, account && `кв. ${account.apartment.number}`]
                .filter(Boolean)
                .join(' · ')
            : 'Особовий рахунок та прозорість будинку'
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
                PDF квитанція
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
                Реквізити для оплати
              </button>
            )}
          </div>
        </section>
      )}

      <nav className="nav-scroll" aria-label="Розділи кабінету">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'account' && !loading && account && (
        <section>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <StatCard label="Борг" value={formatMoney(account.summary.debt)} tone={account.summary.debt > 0 ? 'danger' : 'success'} />
            <StatCard label="Сплачено" value={formatMoney(account.summary.totalPaid)} />
          </div>

          {transparency?.bankAccounts && transparency.bankAccounts.length > 0 && (
            <div className="card" id="bank-details" style={{ marginBottom: '1rem' }}>
              <h2 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>Реквізити для оплати</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                Сплатіть внесок за реквізитами ОСМД. У призначенні платежу вкажіть квартиру.
              </p>
              {transparency.bankAccounts.map((b) => (
                <div key={b.id} style={{ marginBottom: '1rem' }}>
                  <dl className="bank-details">
                    <dt>Банк</dt>
                    <dd>{b.bankName}</dd>
                    <dt>IBAN</dt>
                    <dd>
                      {b.iban}{' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => copyText('iban', b.iban)}
                      >
                        {copied === 'iban' ? 'Скопійовано' : 'Копіювати'}
                      </button>
                    </dd>
                    {b.description && (
                      <>
                        <dt>Опис</dt>
                        <dd style={{ fontFamily: 'inherit', fontWeight: 500 }}>{b.description}</dd>
                      </>
                    )}
                    {transparency.building?.edrpou && (
                      <>
                        <dt>ЄДРПОУ</dt>
                        <dd>{transparency.building.edrpou}</dd>
                      </>
                    )}
                    <dt>Призначення платежу</dt>
                    <dd>
                      {paymentPurpose}{' '}
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => copyText('purpose', paymentPurpose)}
                      >
                        {copied === 'purpose' ? 'Скопійовано' : 'Копіювати'}
                      </button>
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Нарахування</h2>
            {account.lines.length === 0 ? (
              <EmptyState
                title="Нарахувань ще немає"
                description="Коли правління згенерує внески, вони з’являться тут."
              />
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {account.lines.map((line) => (
                  <li key={line.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{line.title}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>{line.period}</span>
                          <Badge
                            tone={
                              line.status === 'paid'
                                ? 'success'
                                : line.status === 'overdue'
                                  ? 'danger'
                                  : 'muted'
                            }
                          >
                            {STATUS_LABELS[line.status] ?? line.status}
                          </Badge>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>
                          {formatMoney(line.balance > 0 ? line.balance : line.amount)}
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => handleReceipt(line.id)}
                          style={{ marginTop: '0.25rem' }}
                        >
                          PDF
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === 'building' && !loading && transparency && (
        <section>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <StatCard label="Витрати ОСМД" value={formatMoney(transparency.expenseSummary.total)} tone="danger" />
            <StatCard label="Надходження" value={formatMoney(transparency.cashFlow.totalIncome)} tone="success" />
          </div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>По категоріях</h2>
            {transparency.expenseSummary.byCategory.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Немає даних</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
                {transparency.expenseSummary.byCategory.map((c) => (
                  <li key={c.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.name}</span>
                    <span style={{ fontWeight: 600 }}>{formatMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Баланс фондів</h2>
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
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Оголошення</h2>
            {announcements.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Оголошень немає</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {announcements.map((a) => (
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
            <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Опитування</h2>
            {polls.filter((p) => p.isActive).length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Активних опитувань немає</p>
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
                            {p._count.votes > 0 && (
                              <span style={{ float: 'right', opacity: 0.7 }}>
                                {Math.round((o._count.votes / p._count.votes) * 100)}%
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {p.userVote && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                        Дякуємо за голос!
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleRequest} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>Нова заявка</h2>
            <div>
              <label htmlFor="req-title">Тема</label>
              <input id="req-title" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="req-desc">Опис</label>
              <textarea id="req-desc" rows={3} value={reqDesc} onChange={(e) => setReqDesc(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="req-cat">Категорія</label>
              <select id="req-cat" value={reqCategory} onChange={(e) => setReqCategory(e.target.value)}>
                <option value="sanitary">Сантехніка</option>
                <option value="electric">Електрика</option>
                <option value="cleaning">Прибирання</option>
                <option value="other">Інше</option>
              </select>
            </div>
            <button type="submit">Надіслати</button>
          </form>

          {requests.length > 0 && (
            <div className="card">
              <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Мої заявки</h2>
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
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Документи ОСМД</h2>
          {transparency.documents.length === 0 ? (
            <EmptyState title="Публічних документів немає" />
          ) : (
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
              {transparency.documents.map((d) => (
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
            Боржники ({transparency.debtors.length})
          </h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Кв.</th>
                  <th>Борг</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {transparency.debtors.map((d) => (
                  <tr key={d.number}>
                    <td>{d.number}</td>
                    <td>{formatMoney(d.debt)}</td>
                    <td style={{ color: d.isOverdue ? 'var(--danger)' : 'var(--muted)' }}>
                      {d.isOverdue ? 'Прострочено' : 'До сплати'}
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

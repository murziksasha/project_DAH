'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, downloadReceipt, getToken } from '@/lib/api';

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

interface Transparency {
  building: { name: string; showDebtorsToResidents: boolean } | null;
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
  { id: 'building', label: 'Витрати дому' },
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
  const [reqTitle, setReqTitle] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqCategory, setReqCategory] = useState('other');
  const [commsMessage, setCommsMessage] = useState('');

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
      .catch((err) => setError(err.message));
  }, []);

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

  const visibleTabs = TABS.filter(
    (t) => t.id !== 'debtors' || transparency?.debtors !== null,
  );

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1rem' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h1>Кабінет мешканця</h1>
        <p style={{ color: 'var(--muted)' }}>
          {userName && `Вітаємо, ${userName}`}
          {account ? ` · кв. ${account.apartment.number}` : ''}
        </p>
      </header>

      <nav style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'var(--primary)' : 'var(--surface-2)',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}

      {tab === 'account' && account && (
        <section>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <div className="card">
              <div className="stat-label">Борг</div>
              <div className="stat-value" style={{ color: account.summary.debt > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {account.summary.debt.toLocaleString('uk-UA')} ₴
              </div>
            </div>
            <div className="card">
              <div className="stat-label">Сплачено</div>
              <div className="stat-value">{account.summary.totalPaid.toLocaleString('uk-UA')} ₴</div>
            </div>
          </div>
          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>Нарахування</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
              {account.lines.map((line) => (
                <li key={line.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{line.title}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {line.period} · {STATUS_LABELS[line.status] ?? line.status}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>
                        {(line.balance > 0 ? line.balance : line.amount).toLocaleString('uk-UA')} ₴
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReceipt(line.id)}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', marginTop: '0.25rem' }}
                      >
                        PDF
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tab === 'building' && transparency && (
        <section>
          <div className="grid-2" style={{ marginBottom: '1rem' }}>
            <div className="card">
              <div className="stat-label">Витрати ОСМД</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>
                {transparency.expenseSummary.total.toLocaleString('uk-UA')} ₴
              </div>
            </div>
            <div className="card">
              <div className="stat-label">Надходження</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {transparency.cashFlow.totalIncome.toLocaleString('uk-UA')} ₴
              </div>
            </div>
          </div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>По категоріях</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
              {transparency.expenseSummary.byCategory.map((c) => (
                <li key={c.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{c.name}</span>
                  <span style={{ fontWeight: 600 }}>{c.total.toLocaleString('uk-UA')} ₴</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>Баланс фондів</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
              {transparency.cashFlow.fundBalances.map((f) => (
                <li key={f.fundName} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{f.fundName}</span>
                  <span style={{ fontWeight: 600 }}>{f.balance.toLocaleString('uk-UA')} ₴</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tab === 'communications' && (
        <section>
          {commsMessage && <p style={{ color: 'var(--success)', marginBottom: '1rem' }}>{commsMessage}</p>}

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Оголошення</h2>
            {announcements.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Оголошень немає</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {announcements.map((a) => (
                  <li key={a.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600 }}>{a.isPinned && '📌 '}{a.title}</div>
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.25rem 0' }}>{a.body}</p>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {new Date(a.createdAt).toLocaleDateString('uk-UA')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>Опитування</h2>
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
                    {p.userVote && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>Дякуємо за голос!</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleRequest} className="card" style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
            <h2>Нова заявка</h2>
            <div>
              <label>Тема</label>
              <input value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} required />
            </div>
            <div>
              <label>Опис</label>
              <textarea rows={3} value={reqDesc} onChange={(e) => setReqDesc(e.target.value)} required />
            </div>
            <div>
              <label>Категорія</label>
              <select value={reqCategory} onChange={(e) => setReqCategory(e.target.value)}>
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
              <h2 style={{ marginBottom: '1rem' }}>Мої заявки</h2>
              <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                {requests.map((r) => (
                  <li key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {REQUEST_STATUS[r.status] ?? r.status} · {new Date(r.createdAt).toLocaleDateString('uk-UA')}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'documents' && transparency && (
        <section className="card">
          <h2 style={{ marginBottom: '1rem' }}>Документи ОСМД</h2>
          {transparency.documents.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Публічних документів немає</p>
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

      {tab === 'debtors' && transparency?.debtors && (
        <section className="card">
          <h2 style={{ marginBottom: '1rem' }}>Боржники ({transparency.debtors.length})</h2>
          <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Кв.</th>
                <th style={{ padding: '0.5rem' }}>Борг ₴</th>
                <th style={{ padding: '0.5rem' }}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {transparency.debtors.map((d) => (
                <tr key={d.number} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem' }}>{d.number}</td>
                  <td style={{ padding: '0.5rem' }}>{d.debt.toLocaleString('uk-UA')}</td>
                  <td style={{ padding: '0.5rem', color: d.isOverdue ? 'var(--danger)' : 'var(--muted)' }}>
                    {d.isOverdue ? 'Прострочено' : 'До сплати'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link href="/" style={{ color: 'var(--muted)' }}>На головну</Link>
      </p>
    </main>
  );
}
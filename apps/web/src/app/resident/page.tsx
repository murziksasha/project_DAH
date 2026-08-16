'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiFetch, downloadReceipt, getToken, uploadFile } from '@/lib/api';
import {
  myAccountPath,
  onApartmentChange,
  resolveResidentApartmentId,
} from '@/lib/apartment-context';
import { formatDateUk, formatMoney } from '@/lib/money';
import {
  formatPeriodLabel,
  getMetersDeadlineInfo,
} from '@/lib/meters-deadline';
import {
  countQueuedMeterReadings,
  METER_QUEUE_EVENT,
} from '@/lib/meter-offline-queue';
import {
  countQueuedRequests,
  enqueueRequestDraft,
  isBrowserOffline,
  REQUEST_QUEUE_EVENT,
} from '@/lib/request-offline-queue';
import { AccountTab, type ResidentAccount } from './_components/AccountTab';
import { PaySheet } from './_components/PaySheet';
import {
  ResidentActions,
  type ResidentAction,
} from './_components/ResidentActions';
import { TransparencyStories } from './_components/TransparencyStories';

type Tab =
  | 'home'
  | 'account'
  | 'news'
  | 'requests'
  | 'building'
  | 'documents'
  | 'debtors'
  | 'more';

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
  isRead?: boolean;
  author: { firstName: string; lastName: string };
}

interface RequestItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority?: string;
  dueAt?: string | null;
  updatedAt?: string;
  createdAt: string;
  slaStatus?: string | null;
  isOverdue?: boolean;
  photoKeys?: string[];
  photoUrls?: string[];
  assignee?: { firstName: string; lastName: string } | null;
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

interface MeterHint {
  id: string;
  name: string;
  isActive?: boolean;
  readings: Array<{ period: string }>;
}

function normalizeTab(raw: string | null): Tab {
  if (!raw || raw === 'home') return 'home';
  if (raw === 'communications') return 'requests';
  if (
    raw === 'account' ||
    raw === 'news' ||
    raw === 'requests' ||
    raw === 'building' ||
    raw === 'documents' ||
    raw === 'debtors' ||
    raw === 'more'
  ) {
    return raw;
  }
  return 'home';
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function statusTone(status: string): 'muted' | 'success' | 'danger' | 'primary' | 'warning' {
  if (status === 'done') return 'success';
  if (status === 'in_progress') return 'primary';
  if (status === 'new') return 'warning';
  return 'muted';
}

function isNoApartmentError(msg: string): boolean {
  return /квартиру не прив|не прив.?язано|apartment/i.test(msg);
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
    { id: 'news', label: t('residentTabNews') },
    { id: 'requests', label: t('residentTabRequests') },
    { id: 'building', label: t('residentTabTransparency') },
    { id: 'documents', label: t('residentTabDocs') },
    { id: 'debtors', label: t('residentTabDebtors') },
  ];

  const [tab, setTab] = useState<Tab>('home');
  const [account, setAccount] = useState<Account | null>(null);
  const [transparency, setTransparency] = useState<Transparency | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [metersNeedReading, setMetersNeedReading] = useState(false);
  const [metersPendingCount, setMetersPendingCount] = useState(0);
  const [deadlineDay, setDeadlineDay] = useState(5);
  const [apartmentId, setApartmentId] = useState<string | null>(null);
  const [noApartment, setNoApartment] = useState(false);
  const [userName, setUserName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [transparencyLoading, setTransparencyLoading] = useState(false);
  const [reqTitle, setReqTitle] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqCategory, setReqCategory] = useState('other');
  const [reqPhotos, setReqPhotos] = useState<Array<{ key: string; url: string }>>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [commsMessage, setCommsMessage] = useState('');
  const [copied, setCopied] = useState('');
  const [onlinePayEnabled, setOnlinePayEnabled] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [tabSearch, setTabSearch] = useState('');
  const [focusNewRequest, setFocusNewRequest] = useState(false);
  const [highlightRequestId, setHighlightRequestId] = useState<string | null>(null);
  const [accountStartExpanded, setAccountStartExpanded] = useState(false);
  const [meterQueueCount, setMeterQueueCount] = useState(0);
  const [requestQueueCount, setRequestQueueCount] = useState(0);
  const transparencyLoaded = useRef(false);
  const newsMarked = useRef(false);
  const payDeepLinked = useRef(false);

  const setTabAndUrl = useCallback((next: Tab, opts?: { newRequest?: boolean }) => {
    setTab(next);
    setTabSearch('');
    if (opts?.newRequest) setFocusNewRequest(true);
    const url = new URL(window.location.href);
    if (next === 'home') {
      url.searchParams.delete('tab');
      url.searchParams.delete('new');
      url.searchParams.delete('requestId');
    } else {
      url.searchParams.set('tab', next);
      if (opts?.newRequest) url.searchParams.set('new', '1');
      else url.searchParams.delete('new');
      if (next !== 'requests') url.searchParams.delete('requestId');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const loadTransparency = useCallback(async (token: string) => {
    if (transparencyLoaded.current) return;
    setTransparencyLoading(true);
    try {
      const tr = await apiFetch<Transparency>('/transparency/dashboard', { token });
      setTransparency(tr);
      transparencyLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setTransparencyLoading(false);
    }
  }, [t]);

  // Initial: critical home data, then signals (lazy phases)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let next = normalizeTab(params.get('tab'));
    const reqId = params.get('requestId');
    if (reqId) {
      setHighlightRequestId(reqId);
      next = 'requests';
    }
    if (params.get('new') === '1' || params.get('new') === 'true') {
      setFocusNewRequest(true);
      if (next === 'home' && !reqId) next = 'requests';
    }
    if (params.get('pay') === '1') {
      payDeepLinked.current = true;
      next = 'home';
    }
    if (params.get('paid') === '1') next = 'account';
    if (params.get('year') || params.get('month')) {
      setAccountStartExpanded(true);
      if (next === 'home') next = 'account';
    }
    setTab(next);

    const token = getToken();
    const userRaw = localStorage.getItem('dah_user');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    if (userRaw) {
      try {
        const user = JSON.parse(userRaw) as {
          firstName?: string;
          lastName?: string;
          apartmentId?: string | null;
        };
        setUserName(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim());
      } catch {
        /* ignore */
      }
    }

    const aptId = resolveResidentApartmentId();
    setApartmentId(aptId || null);
    if (!aptId) setNoApartment(true);

    const period = currentPeriod();
    const needTransparency =
      next === 'building' || next === 'documents' || next === 'debtors';

    // Phase 1 — account + pay + meters (first paint)
    Promise.all([
      apiFetch<Account>(myAccountPath(), { token }).catch((err: Error) => {
        if (isNoApartmentError(err.message)) {
          setNoApartment(true);
          return null;
        }
        throw err;
      }),
      apiFetch<{ enabled: boolean }>('/payments/online/status', { skipAuth: true }).catch(() => ({
        enabled: false,
      })),
      aptId
        ? apiFetch<MeterHint[]>(`/meters/apartment/${aptId}`, { token }).catch(() => [])
        : Promise.resolve([] as MeterHint[]),
      apiFetch<{ metersReadingDeadlineDay?: number }>('/building/settings', { token }).catch(
        () => ({ metersReadingDeadlineDay: 5 }),
      ),
    ])
      .then(([a, pay, meters, settings]) => {
        if (a) {
          setAccount(a);
          setNoApartment(false);
        }
        setOnlinePayEnabled(Boolean(pay?.enabled));
        setDeadlineDay(settings.metersReadingDeadlineDay ?? 5);
        const active = (meters ?? []).filter((m) => m.isActive !== false);
        const pending = active.filter((m) => !m.readings?.some((r) => r.period === period));
        setMetersNeedReading(pending.length > 0 && active.length > 0);
        setMetersPendingCount(pending.length);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));

    // Phase 2 — signals for action home (announcements, requests, polls)
    Promise.all([
      apiFetch<Announcement[]>('/communications/announcements', { token }),
      apiFetch<RequestItem[]>('/communications/requests', { token }),
      apiFetch<Poll[]>('/communications/polls', { token }),
    ])
      .then(([ann, req, pol]) => {
        setAnnouncements(ann);
        setRequests(req);
        setPolls(pol);
      })
      .catch(() => undefined)
      .finally(() => setSignalsLoading(false));

    // Phase 3 — transparency only if needed
    if (needTransparency) {
      void loadTransparency(token);
    }
  }, [loadTransparency]);

  // Lazy transparency: finance tabs, pay sheet bank details, debtors
  useEffect(() => {
    if (
      tab !== 'building' &&
      tab !== 'documents' &&
      tab !== 'debtors' &&
      tab !== 'account' &&
      !payOpen
    ) {
      return;
    }
    const token = getToken();
    if (!token) return;
    void loadTransparency(token);
  }, [tab, payOpen, loadTransparency]);

  useEffect(() => {
    const syncQueue = () => {
      setMeterQueueCount(countQueuedMeterReadings(resolveResidentApartmentId() || undefined));
    };
    syncQueue();
    window.addEventListener(METER_QUEUE_EVENT, syncQueue);
    return () => window.removeEventListener(METER_QUEUE_EVENT, syncQueue);
  }, []);

  // Multi-apartment: soft reload account + meters without full page refresh
  useEffect(() => {
    return onApartmentChange((aptId) => {
      setMeterQueueCount(countQueuedMeterReadings(aptId));
      const token = getToken();
      if (!token) return;
      setApartmentId(aptId);
      setNoApartment(!aptId);
      setLoading(true);
      setError('');
      const period = currentPeriod();
      Promise.all([
        apiFetch<Account>(myAccountPath(aptId), { token }).catch((err: Error) => {
          if (isNoApartmentError(err.message)) {
            setNoApartment(true);
            return null;
          }
          throw err;
        }),
        aptId
          ? apiFetch<MeterHint[]>(`/meters/apartment/${aptId}`, { token }).catch(() => [])
          : Promise.resolve([] as MeterHint[]),
      ])
        .then(([a, meters]) => {
          if (a) {
            setAccount(a);
            setNoApartment(false);
          } else {
            setAccount(null);
          }
          const active = (meters ?? []).filter((m) => m.isActive !== false);
          const pending = active.filter((m) => !m.readings?.some((r) => r.period === period));
          setMetersNeedReading(pending.length > 0 && active.length > 0);
          setMetersPendingCount(pending.length);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    });
  }, []);

  // Mark all news read when opening news tab
  useEffect(() => {
    if (tab !== 'news' || newsMarked.current) return;
    const token = getToken();
    if (!token) return;
    const unread = announcements.some((a) => !a.isRead);
    if (!unread && announcements.length === 0) return;
    if (!unread) {
      newsMarked.current = true;
      return;
    }
    newsMarked.current = true;
    apiFetch('/communications/announcements/read-all', { method: 'PATCH', token })
      .then(() => {
        setAnnouncements((prev) => prev.map((a) => ({ ...a, isRead: true })));
      })
      .catch(() => {
        newsMarked.current = false;
      });
  }, [tab, announcements]);

  useEffect(() => {
    if (!focusNewRequest || tab !== 'requests') return;
    document.getElementById('req-title')?.focus();
    document.getElementById('new-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFocusNewRequest(false);
  }, [focusNewRequest, tab, loading]);

  useEffect(() => {
    if (!highlightRequestId || tab !== 'requests' || signalsLoading) return;
    const el = document.getElementById(`request-${highlightRequestId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const tmr = window.setTimeout(() => setHighlightRequestId(null), 4000);
    return () => window.clearTimeout(tmr);
  }, [highlightRequestId, tab, signalsLoading, requests]);

  const paymentPurpose = useMemo(() => {
    if (!account) return 'Оплата внесків, Мій дім';
    return `Оплата внесків, кв. ${account.apartment.number}`;
  }, [account]);

  const openLineForReceipt = useMemo(() => {
    if (!account?.lines?.length) return null;
    return account.lines.find((l) => l.balance > 0) ?? account.lines[0];
  }, [account]);

  const unreadNews = useMemo(
    () => announcements.filter((a) => !a.isRead).length,
    [announcements],
  );

  const deadlineInfo = useMemo(
    () => getMetersDeadlineInfo(deadlineDay),
    [deadlineDay],
  );

  async function handlePhotoPick(files: FileList | null) {
    if (!files?.length) return;
    const token = getToken();
    if (!token) return;
    setPhotoBusy(true);
    setError('');
    try {
      const uploaded: Array<{ key: string; url: string }> = [];
      for (const file of Array.from(files).slice(0, 3 - reqPhotos.length)) {
        const res = await uploadFile('/files/upload', file, token, 'requests');
        uploaded.push({ key: res.key, url: res.url });
      }
      setReqPhotos((p) => [...p, ...uploaded].slice(0, 3));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setError('');
    const body = {
      title: reqTitle,
      description: reqDesc,
      category: reqCategory,
      photoKeys: reqPhotos.map((p) => p.key),
    };
    if (isBrowserOffline()) {
      enqueueRequestDraft({ ...body, apartmentId });
      setRequestQueueCount(countQueuedRequests());
      setCommsMessage(t('residentRequestQueued'));
      setReqTitle('');
      setReqDesc('');
      setReqPhotos([]);
      return;
    }
    try {
      await apiFetch('/communications/requests', {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      });
      setCommsMessage(t('residentRequestSent'));
      setReqTitle('');
      setReqDesc('');
      setReqPhotos([]);
      const updated = await apiFetch<RequestItem[]>('/communications/requests', { token });
      setRequests(updated);
    } catch (err) {
      // Network failure → queue draft
      if (!navigator.onLine || /network|fetch|failed/i.test(String(err))) {
        enqueueRequestDraft({ ...body, apartmentId });
        setRequestQueueCount(countQueuedRequests());
        setCommsMessage(t('residentRequestQueued'));
        setReqTitle('');
        setReqDesc('');
        setReqPhotos([]);
        return;
      }
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
      setError(t('residentCopyFail'));
    }
  }

  async function markOneAnnouncement(id: string) {
    const token = getToken();
    if (!token) return;
    try {
      await apiFetch(`/communications/announcements/${id}/read`, { method: 'PATCH', token });
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)),
      );
    } catch {
      /* ignore */
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

  async function handleOnlinePay(amount: number) {
    const token = getToken();
    if (!token || !account) return;
    if (amount <= 0) {
      setError(t('residentPayNoDebt'));
      return;
    }
    const apt = resolveResidentApartmentId();
    if (!apt) {
      setError(t('residentMetersNoApt'));
      return;
    }
    setPayBusy(true);
    setError('');
    try {
      const status = await apiFetch<{
        enabled: boolean;
        sandbox: boolean;
      }>('/payments/online/status', { skipAuth: true });

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
          body: JSON.stringify({ apartmentId: apt, amount }),
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
        setPayOpen(false);
        return;
      }

      const paid = await apiFetch<{
        ok: boolean;
        paymentId?: string;
        orderId?: string;
        sandbox?: boolean;
      }>('/payments/online/sandbox-complete', {
        method: 'POST',
        token,
        body: JSON.stringify({ apartmentId: apt, amount }),
      });
      setCommsMessage(
        paid.ok
          ? `Оплату зараховано${paid.sandbox ? ' (sandbox)' : ''}: ${paid.paymentId?.slice(-8) ?? paid.orderId}`
          : t('residentPayFail'),
      );
      const refreshed = await apiFetch<Account>(myAccountPath(), { token });
      setAccount(refreshed);
      setPayOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('residentPayError'));
    } finally {
      setPayBusy(false);
    }
  }

  const visibleTabs = TABS.filter(
    (tb) => tb.id !== 'debtors' || transparency?.debtors !== null,
  );

  const debt = account?.summary.debt ?? 0;
  const advance = account?.summary.advance ?? 0;

  const openPolls = useMemo(
    () => polls.filter((p) => p.isActive && !p.userVote),
    [polls],
  );
  const pinnedAnn = useMemo(
    () => announcements.filter((a) => a.isPinned && !a.isRead).slice(0, 2),
    [announcements],
  );
  const openRequests = useMemo(
    () => requests.filter((r) => r.status === 'new' || r.status === 'in_progress'),
    [requests],
  );

  // Deep-link: /resident?pay=1 → open Pay sheet once account loaded
  useEffect(() => {
    if (!payDeepLinked.current || loading || !account) return;
    if ((account.summary?.debt ?? 0) > 0 || true) {
      setPayOpen(true);
      payDeepLinked.current = false;
      const url = new URL(window.location.href);
      url.searchParams.delete('pay');
      window.history.replaceState({}, '', url.toString());
    }
  }, [loading, account]);

  useEffect(() => {
    const syncReqQ = () => setRequestQueueCount(countQueuedRequests());
    syncReqQ();
    window.addEventListener(REQUEST_QUEUE_EVENT, syncReqQ);
    window.addEventListener('online', syncReqQ);
    return () => {
      window.removeEventListener(REQUEST_QUEUE_EVENT, syncReqQ);
      window.removeEventListener('online', syncReqQ);
    };
  }, []);

  const homeActions: ResidentAction[] = useMemo(() => {
    const list: ResidentAction[] = [];
    if (meterQueueCount > 0) {
      list.push({
        id: 'meter-queue',
        kind: 'meters',
        title: t('residentActionMeterQueue', { count: meterQueueCount }),
        subtitle: t('residentActionMeterQueueSub'),
        primary: true,
        href: '/resident/meters',
      });
    }
    if (requestQueueCount > 0) {
      list.push({
        id: 'request-queue',
        kind: 'request',
        title: t('residentActionRequestQueue', { count: requestQueueCount }),
        subtitle: t('residentActionRequestQueueSub'),
        primary: meterQueueCount === 0,
        onClick: () => setTabAndUrl('requests'),
      });
    }
    if (debt > 0) {
      list.push({
        id: 'pay',
        kind: 'pay',
        title: t('residentActionPay', { amount: formatMoney(debt) }),
        subtitle: t('residentActionPaySub'),
        primary: meterQueueCount === 0 && requestQueueCount === 0,
        onClick: () => setPayOpen(true),
      });
    }
    if (metersNeedReading) {
      list.push({
        id: 'meters',
        kind: 'meters',
        title: t('residentActionMeters'),
        subtitle: t('residentActionMetersSub', { period: currentPeriod() }),
        href: '/resident/meters',
      });
    }
    for (const p of openPolls.slice(0, 2)) {
      list.push({
        id: `poll-${p.id}`,
        kind: 'poll',
        title: t('residentActionPoll'),
        subtitle: p.question,
        onClick: () => setTabAndUrl('news'),
      });
    }
    for (const r of openRequests.slice(0, 2)) {
      list.push({
        id: `req-${r.id}`,
        kind: 'request',
        title: r.title,
        subtitle: REQUEST_STATUS[r.status] ?? r.status,
        onClick: () => setTabAndUrl('requests'),
      });
    }
    for (const a of pinnedAnn) {
      list.push({
        id: `ann-${a.id}`,
        kind: 'announcement',
        title: a.title,
        subtitle: t('residentActionPinned'),
        onClick: () => setTabAndUrl('news'),
      });
    }
    if (unreadNews > 0 && !pinnedAnn.length) {
      list.push({
        id: 'unread-news',
        kind: 'announcement',
        title: t('residentUnreadNews', { count: unreadNews }),
        subtitle: t('residentTabNews'),
        onClick: () => setTabAndUrl('news'),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debt,
    metersNeedReading,
    meterQueueCount,
    requestQueueCount,
    openPolls,
    openRequests,
    pinnedAnn,
    unreadNews,
    t,
    setTabAndUrl,
  ]);

  const apartmentLabel = account
    ? t('residentApt', { number: account.apartment.number }) +
      (account.apartment.buildingName ? ` · ${account.apartment.buildingName}` : '')
    : undefined;

  const showDesktopTabs = tab !== 'home' && tab !== 'more';

  if (!loading && noApartment && !account) {
    return (
      <main className="resident-page">
        <PageHeader title={t('residentCabinetTitle')} description={userName || undefined} />
        <EmptyState
          title={t('residentNoApartmentTitle')}
          description={t('residentNoApartmentDesc')}
        />
      </main>
    );
  }

  return (
    <main className="resident-page">
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

      {error && (
        <p className="error" style={{ marginBottom: '0.75rem' }}>
          {error}
        </p>
      )}
      {commsMessage && tab !== 'news' && tab !== 'requests' && (
        <p className="success-banner">{commsMessage}</p>
      )}

      {loading && <SkeletonCards count={2} />}

      {/* C: Meters deadline banner on home */}
      {!loading &&
        tab === 'home' &&
        metersNeedReading &&
        (deadlineInfo.inWindow || deadlineInfo.overdue) && (
          <Link
            href="/resident/meters"
            className={`card meters-deadline-banner${deadlineInfo.overdue ? ' is-overdue' : ''}`}
            style={{ display: 'block', marginBottom: '1rem', textDecoration: 'none', color: 'inherit' }}
          >
            <strong>
              {deadlineInfo.overdue
                ? t('residentMetersDeadlineOverdue', {
                    day: deadlineInfo.deadlineDay,
                    period: formatPeriodLabel(deadlineInfo.period),
                  })
                : t('residentMetersDeadlineBanner', {
                    day: deadlineInfo.deadlineDay,
                    days: Math.max(0, deadlineInfo.daysLeft),
                    period: formatPeriodLabel(deadlineInfo.period),
                  })}
            </strong>
            {metersPendingCount > 0 && (
              <p className="resident-muted resident-sm" style={{ margin: '0.35rem 0 0' }}>
                {t('residentMetersPendingCount', { count: metersPendingCount })}
              </p>
            )}
          </Link>
        )}

      {!loading && tab === 'home' && account && (
        <ResidentActions
          debt={debt}
          advance={advance}
          actions={homeActions}
          onPay={() => setPayOpen(true)}
          apartmentLabel={apartmentLabel}
        />
      )}

      {!loading && tab === 'home' && signalsLoading && (
        <p className="resident-muted" style={{ marginBottom: '0.75rem' }}>
          {t('residentLoadingSignals')}
        </p>
      )}

      {!loading && tab === 'home' && (
        <section className="resident-shortcuts card" aria-label={t('residentShortcuts')}>
          <h2 className="resident-section-title">{t('residentShortcuts')}</h2>
          <div className="resident-shortcut-grid">
            <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('account')}>
              {t('residentTabAccount')}
            </button>
            <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('news')}>
              {t('residentTabNews')}
              {unreadNews > 0 && (
                <span className="resident-shortcut-badge">{unreadNews > 9 ? '9+' : unreadNews}</span>
              )}
            </button>
            <button
              type="button"
              className="resident-shortcut"
              onClick={() => setTabAndUrl('requests', { newRequest: true })}
            >
              {t('residentTabRequests')}
            </button>
            <Link href="/resident/meters" className="resident-shortcut">
              {t('meters')}
              {metersPendingCount > 0 && (
                <span className="resident-shortcut-badge">{metersPendingCount}</span>
              )}
            </Link>
            <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('building')}>
              {t('residentTabTransparency')}
            </button>
            <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('documents')}>
              {t('residentTabDocs')}
            </button>
            <Link href="/resident/meetings" className="resident-shortcut">
              {t('residentMeetingsLink')}
            </Link>
            <Link href="/resident/messenger" className="resident-shortcut">
              {t('residentMessengerLink')}
            </Link>
          </div>
        </section>
      )}

      {!loading && tab === 'more' && (
        <section className="resident-shortcuts card">
          <h2 className="resident-section-title">{t('residentNavMore')}</h2>
          <div className="resident-shortcut-grid">
            <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('news')}>
              {t('residentTabNews')}
              {unreadNews > 0 && (
                <span className="resident-shortcut-badge">{unreadNews > 9 ? '9+' : unreadNews}</span>
              )}
            </button>
            <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('building')}>
              {t('residentTabTransparency')}
            </button>
            <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('documents')}>
              {t('residentTabDocs')}
            </button>
            {(transparency?.debtors !== null || !transparencyLoaded.current) && (
              <button type="button" className="resident-shortcut" onClick={() => setTabAndUrl('debtors')}>
                {t('residentTabDebtors')}
              </button>
            )}
            <Link href="/resident/meetings" className="resident-shortcut">
              {t('residentMeetingsLink')}
            </Link>
            <Link href="/resident/messenger" className="resident-shortcut">
              {t('residentMessengerLink')}
            </Link>
            <Link href="/resident/security" className="resident-shortcut">
              {t('securityShort')}
            </Link>
            <Link href="/resident/instructions" className="resident-shortcut">
              {t('instructions')}
            </Link>
          </div>
        </section>
      )}

      {showDesktopTabs && (
        <nav className="nav-scroll resident-tabs" aria-label={t('residentSections')}>
          <button type="button" className="tab-btn" onClick={() => setTabAndUrl('home')}>
            {t('home')}
          </button>
          {visibleTabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              className={`tab-btn${tab === tb.id ? ' active' : ''}`}
              onClick={() => setTabAndUrl(tb.id)}
            >
              {tb.label}
              {tb.id === 'news' && unreadNews > 0 && (
                <span className="tab-badge">{unreadNews > 9 ? '9+' : unreadNews}</span>
              )}
            </button>
          ))}
        </nav>
      )}

      {tab !== 'home' &&
        tab !== 'more' &&
        tab !== 'account' &&
        tab !== 'requests' && (
          <div className="resident-tab-search card">
            <label htmlFor="tab-search" className="sr-only">
              {t('residentSearch')}
            </label>
            <input
              id="tab-search"
              type="search"
              placeholder={
                tab === 'news'
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
          onPay={() => setPayOpen(true)}
          copied={copied}
          onCopy={(label, text) => void copyText(label, text)}
          startExpanded={accountStartExpanded}
        />
      )}

      {tab === 'account' && !loading && !account && !noApartment && (
        <SkeletonCards count={1} />
      )}

      {/* Load bank accounts for pay sheet if not yet */}
      {tab === 'account' && account && !transparency && !transparencyLoaded.current && (
        <span className="sr-only">{t('loading')}</span>
      )}

      {(tab === 'building' || tab === 'documents' || tab === 'debtors') &&
        transparencyLoading && <SkeletonCards count={2} />}

      {tab === 'building' && !transparencyLoading && transparency && (
        <section>
          <TransparencyStories
            totalExpenses={transparency.expenseSummary.total}
            totalIncome={transparency.cashFlow.totalIncome}
            netFlow={transparency.cashFlow.netFlow}
            byCategory={transparency.expenseSummary.byCategory}
            fundBalances={transparency.cashFlow.fundBalances}
          />
          <div className="grid-2" style={{ marginBottom: '1rem', marginTop: '1rem' }}>
            <StatCard
              label={t('residentOrgExpenses')}
              value={formatMoney(transparency.expenseSummary.total)}
              tone="danger"
            />
            <StatCard
              label={t('dashIncome')}
              value={formatMoney(transparency.cashFlow.totalIncome)}
              tone="success"
            />
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

      {tab === 'news' && (
        <section>
          {signalsLoading && <SkeletonCards count={2} />}
          {commsMessage && <p className="success-banner">{commsMessage}</p>}
          {!signalsLoading && (
            <>
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t('commsAnnouncements')}</h2>
                  {unreadNews > 0 && (
                    <Badge tone="primary">{t('residentUnreadBadge', { count: unreadNews })}</Badge>
                  )}
                </div>
                {filteredAnnouncements.length === 0 ? (
                  <p style={{ color: 'var(--muted)' }}>
                    {announcements.length === 0
                      ? t('residentNoAnnouncements')
                      : t('residentNothingFound')}
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', display: 'grid', gap: '0.75rem' }}>
                    {filteredAnnouncements.map((a) => (
                      <li
                        key={a.id}
                        className={`resident-ann-item${!a.isRead ? ' is-unread' : ''}`}
                        onClick={() => {
                          if (!a.isRead) void markOneAnnouncement(a.id);
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {a.isPinned && '📌 '}
                          {!a.isRead && (
                            <span className="resident-unread-dot" aria-label="new" />
                          )}
                          {a.title}
                        </div>
                        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                          {a.body}
                        </p>
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
                    {polls
                      .filter((p) => p.isActive)
                      .map((p) => (
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
                                    background:
                                      p.userVote === o.id ? 'var(--primary)' : 'var(--surface-2)',
                                    color: p.userVote === o.id ? '#fff' : 'var(--text)',
                                    fontSize: '0.9rem',
                                    padding: '0.5rem 0.75rem',
                                  }}
                                >
                                  {o.text}
                                  {(o.voteCount ?? o._count?.votes ?? 0) > 0 &&
                                    p._count.votes > 0 && (
                                      <span style={{ float: 'right', opacity: 0.7 }}>
                                        {o.weightSum != null
                                          ? `${o.weightSum}`
                                          : `${Math.round(
                                              ((o.voteCount ?? o._count?.votes ?? 0) /
                                                p._count.votes) *
                                                100,
                                            )}%`}
                                      </span>
                                    )}
                                </button>
                              </li>
                            ))}
                          </ul>
                          {p.stats && (
                            <p
                              style={{
                                fontSize: '0.8rem',
                                color: 'var(--muted)',
                                marginTop: '0.35rem',
                              }}
                            >
                              Явка {p.stats.participationPercent}%
                              {p.stats.quorumPercent != null
                                ? ` · кворум ${p.stats.quorumPercent}% (${p.stats.quorumMet ? 'є' : 'немає'})`
                                : ''}
                            </p>
                          )}
                          {p.userVote && (
                            <p
                              style={{
                                fontSize: '0.8rem',
                                color: 'var(--muted)',
                                marginTop: '0.25rem',
                              }}
                            >
                              {t('residentThanksVote')}
                            </p>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'requests' && (
        <section>
          {signalsLoading && <SkeletonCards count={1} />}
          {commsMessage && <p className="success-banner">{commsMessage}</p>}
          {!signalsLoading && (
            <>
              <form
                id="new-request"
                onSubmit={handleRequest}
                className="card"
                style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}
              >
                <h2 style={{ fontSize: '1.1rem' }}>{t('residentNewRequest')}</h2>
                <div>
                  <label htmlFor="req-title">{t('residentReqSubject')}</label>
                  <input
                    id="req-title"
                    value={reqTitle}
                    onChange={(e) => setReqTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="req-desc">{t('residentReqDesc')}</label>
                  <textarea
                    id="req-desc"
                    rows={3}
                    value={reqDesc}
                    onChange={(e) => setReqDesc(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="req-cat">{t('residentReqCategory')}</label>
                  <select
                    id="req-cat"
                    value={reqCategory}
                    onChange={(e) => setReqCategory(e.target.value)}
                  >
                    <option value="sanitary">{t('commsCatSanitary')}</option>
                    <option value="electric">{t('commsCatElectric')}</option>
                    <option value="cleaning">{t('commsCatCleaning')}</option>
                    <option value="other">{t('commsCatOther')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="req-photo">{t('residentReqPhoto')}</label>
                  <input
                    id="req-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    disabled={photoBusy || reqPhotos.length >= 3}
                    onChange={(e) => {
                      void handlePhotoPick(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <p className="resident-muted resident-sm" style={{ marginTop: 4 }}>
                    {t('residentReqPhotoHint')}
                  </p>
                  {reqPhotos.length > 0 && (
                    <div className="resident-req-photos">
                      {reqPhotos.map((p) => (
                        <div key={p.key} className="resident-req-photo-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt="" />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setReqPhotos((list) => list.filter((x) => x.key !== p.key))
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={photoBusy}>
                  {t('send')}
                </button>
              </form>

              <div className="card">
                <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
                  {t('residentMyRequests')}
                </h2>
                {requests.length === 0 ? (
                  <EmptyState
                    title={t('residentNoRequests')}
                    description={t('residentNoRequestsDesc')}
                  />
                ) : (
                  <ul className="resident-request-list">
                    {requests.map((r) => (
                      <li
                        key={r.id}
                        id={`request-${r.id}`}
                        className={`resident-request-item${
                          highlightRequestId === r.id ? ' is-highlight' : ''
                        }`}
                      >
                        <div className="resident-request-main">
                          <div style={{ fontWeight: 600 }}>{r.title}</div>
                          <div className="resident-muted resident-sm">
                            {t('residentRequestCreated')}: {formatDateUk(r.createdAt)}
                            {r.updatedAt && r.updatedAt !== r.createdAt && (
                              <>
                                {' · '}
                                {t('residentRequestUpdated')}: {formatDateUk(r.updatedAt)}
                              </>
                            )}
                          </div>
                          {r.description && (
                            <div className="resident-muted resident-sm" style={{ marginTop: 2 }}>
                              {r.description.slice(0, 120)}
                            </div>
                          )}
                          {r.dueAt && r.status !== 'done' && (
                            <div
                              className={`resident-request-sla${r.isOverdue ? ' is-overdue' : ''}`}
                            >
                              {r.isOverdue
                                ? t('residentRequestSlaOverdue', {
                                    date: formatDateUk(r.dueAt),
                                  })
                                : t('residentRequestSlaDue', {
                                    date: formatDateUk(r.dueAt),
                                  })}
                            </div>
                          )}
                          {r.assignee && (
                            <div className="resident-muted resident-sm">
                              {t('residentRequestAssignee')}: {r.assignee.firstName}{' '}
                              {r.assignee.lastName}
                            </div>
                          )}
                          <div className="resident-request-timeline" aria-hidden>
                            <span
                              className={
                                r.status === 'new' ||
                                r.status === 'in_progress' ||
                                r.status === 'done'
                                  ? 'is-on'
                                  : ''
                              }
                            >
                              {t('commsStatusNew')}
                            </span>
                            <span
                              className={
                                r.status === 'in_progress' || r.status === 'done' ? 'is-on' : ''
                              }
                            >
                              {t('commsStatusProgress')}
                            </span>
                            <span className={r.status === 'done' ? 'is-on' : ''}>
                              {t('commsStatusDone')}
                            </span>
                          </div>
                          {r.photoUrls && r.photoUrls.length > 0 && (
                            <div className="resident-req-photos" style={{ marginTop: 8 }}>
                              {r.photoUrls.map((url) => (
                                <a
                                  key={url}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="resident-req-photo-thumb"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge tone={statusTone(r.status)}>
                          {REQUEST_STATUS[r.status] ?? r.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'documents' && !transparencyLoading && transparency && (
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
                <li
                  key={d.id}
                  style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}
                >
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 600 }}
                  >
                    {d.title}
                  </a>
                  {d.description && (
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      {d.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'debtors' && !transparencyLoading && transparency?.debtors && (
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

      <PaySheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        debt={debt}
        bankAccounts={transparency?.bankAccounts}
        buildingEdrpou={transparency?.building?.edrpou}
        paymentPurpose={paymentPurpose}
        onlinePayEnabled={onlinePayEnabled}
        payBusy={payBusy}
        onOnlinePay={(amount) => void handleOnlinePay(amount)}
        onReceipt={
          openLineForReceipt ? () => void handleReceipt(openLineForReceipt.id) : undefined
        }
        hasReceipt={Boolean(openLineForReceipt)}
        copied={copied}
        onCopy={(label, text) => void copyText(label, text)}
      />
    </main>
  );
}

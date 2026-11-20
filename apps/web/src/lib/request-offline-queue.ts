import { getStoredUser } from './auth';

/**
 * Offline queue for resident service request drafts.
 * Persists in localStorage; flushed when online + auth token available.
 */

const KEY = 'dah_request_offline_queue';
export const REQUEST_QUEUE_EVENT = 'dah-request-queue-change';

export interface QueuedRequestDraft {
  id: string;
  title: string;
  description: string;
  category: string;
  photoKeys: string[];
  apartmentId?: string | null;
  userId?: string | null;
  tenantId?: string | null;
  createdAt: string;
  status?: 'pending' | 'syncing' | 'failed';
  syncingSince?: number | null;
  error?: string | null;
}

export interface ListQueueOptions {
  userId?: string | null;
  tenantId?: string | null;
  apartmentId?: string | null;
}

export interface FlushRequestOptions {
  userId?: string | null;
  tenantId?: string | null;
  apartmentId?: string | null;
}

export type FlushRequestResult = {
  sent: number;
  failed: number;
  errors: string[];
};

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof (globalThis as unknown as { localStorage?: Storage }).localStorage !== 'undefined') {
    return (globalThis as unknown as { localStorage: Storage }).localStorage;
  }
  return null;
}

function emitChangeEvent(count: number) {
  const eventName = REQUEST_QUEUE_EVENT;
  const detail = { count };
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  } else if (
    typeof (globalThis as unknown as { dispatchEvent?: (e: unknown) => boolean }).dispatchEvent ===
    'function'
  ) {
    (globalThis as unknown as { dispatchEvent: (e: unknown) => boolean }).dispatchEvent(
      new CustomEvent(eventName, { detail }),
    );
  }
}

function readAll(): QueuedRequestDraft[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRequestDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: QueuedRequestDraft[]) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
  emitChangeEvent(items.length);
}

export function listQueuedRequests(opts?: ListQueueOptions): QueuedRequestDraft[] {
  const all = readAll();
  if (!opts) return all;
  return all.filter((item) => {
    if (opts.userId !== undefined && item.userId !== opts.userId) return false;
    if (opts.tenantId !== undefined && item.tenantId !== opts.tenantId) return false;
    if (opts.apartmentId !== undefined && item.apartmentId !== opts.apartmentId) return false;
    return true;
  });
}

export function countQueuedRequests(opts?: ListQueueOptions): number {
  return listQueuedRequests(opts).length;
}

export function enqueueRequestDraft(
  item: Omit<QueuedRequestDraft, 'id' | 'createdAt'>,
): QueuedRequestDraft {
  let fallbackUserId: string | null = null;
  let fallbackTenantId: string | null = null;
  try {
    const user = getStoredUser();
    fallbackUserId = user?.id ?? null;
    fallbackTenantId = user?.tenantId ?? null;
  } catch {
    // ignore
  }

  const row: QueuedRequestDraft = {
    ...item,
    userId: item.userId !== undefined ? item.userId : fallbackUserId,
    tenantId: item.tenantId !== undefined ? item.tenantId : fallbackTenantId,
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status: item.status ?? 'pending',
    error: item.error ?? null,
  };
  writeAll([...readAll(), row]);
  return row;
}

export function updateQueuedRequest(id: string, patch: Partial<QueuedRequestDraft>) {
  const current = readAll();
  const next = current.map((q) => (q.id === id ? { ...q, ...patch } : q));
  writeAll(next);
}

export function removeQueuedRequest(id: string) {
  writeAll(readAll().filter((q) => q.id !== id));
}

export function clearQueuedRequests(opts?: ListQueueOptions) {
  if (!opts) {
    writeAll([]);
    return;
  }
  const remaining = readAll().filter((item) => {
    if (opts.userId !== undefined && item.userId === opts.userId) return false;
    if (opts.tenantId !== undefined && item.tenantId === opts.tenantId) return false;
    if (opts.apartmentId !== undefined && item.apartmentId === opts.apartmentId) return false;
    return true;
  });
  writeAll(remaining);
}

export async function flushRequestOfflineQueue(
  post: (body: {
    title: string;
    description: string;
    category: string;
    photoKeys: string[];
    apartmentId?: string | null;
    clientRequestId?: string;
  }) => Promise<void>,
  opts?: FlushRequestOptions,
): Promise<FlushRequestResult> {
  const now = Date.now();
  const SYNC_LEASE_MS = 60000; // 60s lease timeout for interrupted syncs

  // Snapshot pending items matching options
  const pending = readAll().filter((item) => {
    if (opts?.userId !== undefined && item.userId !== opts.userId) return false;
    if (opts?.tenantId !== undefined && item.tenantId !== opts.tenantId) return false;
    if (opts?.apartmentId !== undefined && item.apartmentId !== opts.apartmentId) return false;

    if (item.status === 'syncing') {
      const since = item.syncingSince ?? 0;
      if (now - since < SYNC_LEASE_MS) {
        return false;
      }
    }
    return true;
  });

  if (!pending.length) return { sent: 0, failed: 0, errors: [] };

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of pending) {
    updateQueuedRequest(item.id, { status: 'syncing', syncingSince: Date.now() });

    try {
      await post({
        title: item.title,
        description: item.description,
        category: item.category,
        photoKeys: item.photoKeys,
        apartmentId: item.apartmentId,
        clientRequestId: item.id,
      });
      // Atomically remove only this item from current storage
      removeQueuedRequest(item.id);
      sent++;
    } catch (err) {
      failed++;
      const message =
        err instanceof Error ? `${item.title}: ${err.message}` : `${item.title}: error`;
      errors.push(message);
      updateQueuedRequest(item.id, {
        status: 'failed',
        syncingSince: null,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }

  return { sent, failed, errors };
}

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

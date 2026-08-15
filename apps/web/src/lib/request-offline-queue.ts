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
  createdAt: string;
}

function readAll(): QueuedRequestDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRequestDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: QueuedRequestDraft[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
  window.dispatchEvent(
    new CustomEvent(REQUEST_QUEUE_EVENT, { detail: { count: items.length } }),
  );
}

export function listQueuedRequests(): QueuedRequestDraft[] {
  return readAll();
}

export function countQueuedRequests(): number {
  return readAll().length;
}

export function enqueueRequestDraft(
  item: Omit<QueuedRequestDraft, 'id' | 'createdAt'>,
): QueuedRequestDraft {
  const row: QueuedRequestDraft = {
    ...item,
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  writeAll([...readAll(), row]);
  return row;
}

export function removeQueuedRequest(id: string) {
  writeAll(readAll().filter((q) => q.id !== id));
}

export type FlushRequestResult = {
  sent: number;
  failed: number;
  errors: string[];
};

export async function flushRequestOfflineQueue(
  post: (body: {
    title: string;
    description: string;
    category: string;
    photoKeys: string[];
  }) => Promise<void>,
): Promise<FlushRequestResult> {
  const pending = readAll();
  if (!pending.length) return { sent: 0, failed: 0, errors: [] };

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const remaining: QueuedRequestDraft[] = [];

  for (const item of pending) {
    try {
      await post({
        title: item.title,
        description: item.description,
        category: item.category,
        photoKeys: item.photoKeys,
      });
      sent++;
    } catch (err) {
      failed++;
      remaining.push(item);
      errors.push(
        err instanceof Error ? `${item.title}: ${err.message}` : `${item.title}: error`,
      );
    }
  }
  writeAll(remaining);
  return { sent, failed, errors };
}

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

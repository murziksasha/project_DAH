/**
 * Offline queue for resident meter self-readings.
 * Persists in localStorage; flushed when online + auth token available.
 */

const KEY = 'dah_meter_offline_queue';
export const METER_QUEUE_EVENT = 'dah-meter-queue-change';

export interface QueuedMeterReading {
  id: string;
  meterId: string;
  meterName: string;
  apartmentId: string;
  period: string;
  value: number;
  unit?: string;
  createdAt: string;
}

function readAll(): QueuedMeterReading[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMeterReading[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: QueuedMeterReading[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(METER_QUEUE_EVENT, { detail: { count: items.length } }));
}

export function listQueuedMeterReadings(apartmentId?: string): QueuedMeterReading[] {
  const all = readAll();
  if (!apartmentId) return all;
  return all.filter((i) => i.apartmentId === apartmentId);
}

export function countQueuedMeterReadings(apartmentId?: string): number {
  return listQueuedMeterReadings(apartmentId).length;
}

export function enqueueMeterReading(
  item: Omit<QueuedMeterReading, 'id' | 'createdAt'>,
): QueuedMeterReading {
  const all = readAll();
  // Dedupe same meter+period+apartment — keep latest value
  const filtered = all.filter(
    (q) =>
      !(
        q.meterId === item.meterId &&
        q.period === item.period &&
        q.apartmentId === item.apartmentId
      ),
  );
  const row: QueuedMeterReading = {
    ...item,
    id: `${item.meterId}-${item.period}-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  filtered.push(row);
  writeAll(filtered);
  return row;
}

export function removeQueuedMeterReading(id: string) {
  writeAll(readAll().filter((q) => q.id !== id));
}

export function clearQueuedForApartment(apartmentId: string) {
  writeAll(readAll().filter((q) => q.apartmentId !== apartmentId));
}

export type FlushResult = {
  sent: number;
  failed: number;
  errors: string[];
};

/**
 * Flush queue using provided poster (apiFetch wrapper).
 * Removes successful items; keeps failures for retry.
 */
export async function flushMeterOfflineQueue(
  post: (meterId: string, body: { period: string; value: number }) => Promise<void>,
  opts?: { apartmentId?: string },
): Promise<FlushResult> {
  const pending = listQueuedMeterReadings(opts?.apartmentId);
  if (!pending.length) return { sent: 0, failed: 0, errors: [] };

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const remaining = readAll().filter(
    (q) => !pending.some((p) => p.id === q.id),
  );

  for (const item of pending) {
    try {
      await post(item.meterId, { period: item.period, value: item.value });
      sent++;
    } catch (err) {
      failed++;
      remaining.push(item);
      errors.push(
        err instanceof Error
          ? `${item.meterName}: ${err.message}`
          : `${item.meterName}: error`,
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

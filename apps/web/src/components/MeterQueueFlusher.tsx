'use client';

import { useEffect, useRef } from 'react';
import { apiFetch, getToken } from '@/lib/api';
import { resolveResidentApartmentId } from '@/lib/apartment-context';
import {
  countQueuedMeterReadings,
  flushMeterOfflineQueue,
  METER_QUEUE_EVENT,
} from '@/lib/meter-offline-queue';

/**
 * Global auto-flush of offline meter readings when the browser comes online.
 * Mounted once in AppShell for residents (works from any route).
 */
export function MeterQueueFlusher() {
  const flushing = useRef(false);

  useEffect(() => {
    async function flush() {
      if (flushing.current || typeof navigator !== 'undefined' && !navigator.onLine) return;
      const token = getToken();
      const aptId = resolveResidentApartmentId();
      if (!token || countQueuedMeterReadings() === 0) return;
      flushing.current = true;
      try {
        const result = await flushMeterOfflineQueue(
          async (meterId, body) => {
            await apiFetch(`/meters/${meterId}/readings/self`, {
              method: 'POST',
              token,
              body: JSON.stringify(body),
            });
          },
          aptId ? { apartmentId: aptId } : undefined,
        );
        if (result.sent > 0) {
          window.dispatchEvent(
            new CustomEvent(METER_QUEUE_EVENT, {
              detail: { count: countQueuedMeterReadings(), flushed: result.sent },
            }),
          );
        }
      } catch {
        /* keep queue */
      } finally {
        flushing.current = false;
      }
    }

    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    // Attempt once after mount (recover after crash / SW)
    const t = window.setTimeout(() => void flush(), 1500);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearTimeout(t);
    };
  }, []);

  return null;
}

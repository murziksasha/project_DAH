'use client';

import { useEffect, useRef } from 'react';
import { apiFetch, getToken } from '@/lib/api';
import {
  flushRequestOfflineQueue,
  REQUEST_QUEUE_EVENT,
} from '@/lib/request-offline-queue';

/** Auto-flush offline request drafts when the browser is online. */
export function RequestQueueFlusher() {
  const busy = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (busy.current || !navigator.onLine) return;
      const token = getToken();
      if (!token) return;
      busy.current = true;
      try {
        await flushRequestOfflineQueue(async (body) => {
          await apiFetch('/communications/requests', {
            method: 'POST',
            token,
            body: JSON.stringify(body),
          });
        });
      } finally {
        busy.current = false;
      }
    };

    void run();
    window.addEventListener('online', run);
    window.addEventListener(REQUEST_QUEUE_EVENT, run);
    window.addEventListener('dah-auth-change', run);
    return () => {
      window.removeEventListener('online', run);
      window.removeEventListener(REQUEST_QUEUE_EVENT, run);
      window.removeEventListener('dah-auth-change', run);
    };
  }, []);

  return null;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { checkApiHealth } from '@/lib/api';

export function HealthBanner() {
  const [offline, setOffline] = useState(false);

  const ping = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(true);
      return;
    }
    const ok = await checkApiHealth();
    setOffline(!ok);
  }, []);

  useEffect(() => {
    ping();
    const id = window.setInterval(ping, 30_000);
    const onOnline = () => ping();
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [ping]);

  if (!offline) return null;

  return (
    <div className="health-banner" role="status">
      Немає зв&apos;язку з сервером «Мій дім». Перевірте Wi‑Fi, KeenDNS або що Docker/API запущено.
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => ping()} style={{ marginLeft: '0.75rem' }}>
        Спробувати знову
      </button>
    </div>
  );
}

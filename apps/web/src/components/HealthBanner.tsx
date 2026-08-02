'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { checkApiHealth } from '@/lib/api';

export function HealthBanner() {
  const { t } = useI18n();
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
      {t('healthOffline')}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => ping()} style={{ marginLeft: '0.75rem' }}>
        {t('tryAgain')}
      </button>
    </div>
  );
}

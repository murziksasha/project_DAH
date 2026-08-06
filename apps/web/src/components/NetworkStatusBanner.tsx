'use client';

import { useI18n } from '@/components/LocaleProvider';
import { getStoredUser } from '@/lib/auth';
import { countQueuedMeterReadings } from '@/lib/meter-offline-queue';
import { useNetworkStatus } from '@/lib/network-status';

/** Replaces HealthBanner: browser offline vs API down vs recovered. */
export function NetworkStatusBanner() {
  const { t } = useI18n();
  const { kind, recoveredFlash, retry } = useNetworkStatus();
  const user = getStoredUser();
  const isResident = user?.role === 'resident';
  const queueCount = typeof window !== 'undefined' ? countQueuedMeterReadings() : 0;

  if (recoveredFlash && kind === 'ok') {
    return (
      <div
        className="health-banner network-banner network-banner--ok"
        role="status"
        style={{ background: 'var(--success)', color: '#fff' }}
      >
        {t('networkRecovered')}
        {isResident && queueCount > 0 ? ` ${t('networkRecoveredMetersHint')}` : ''}
      </div>
    );
  }

  if (kind === 'ok') return null;

  const isOffline = kind === 'offline';
  return (
    <div
      className={`health-banner network-banner ${isOffline ? 'network-banner--offline' : 'network-banner--api'}`}
      role="alert"
    >
      <span>
        {isOffline
          ? isResident
            ? t('networkOfflineResident')
            : t('networkOffline')
          : t('networkApiDown')}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => void retry()}
        style={{ marginLeft: '0.75rem', color: 'inherit', borderColor: 'currentColor' }}
      >
        {t('tryAgain')}
      </button>
    </div>
  );
}

/** @deprecated use NetworkStatusBanner */
export { NetworkStatusBanner as HealthBanner };

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkApiHealth } from '@/lib/api';

export type NetworkKind = 'ok' | 'offline' | 'api-down';

export function useNetworkStatus() {
  const [kind, setKind] = useState<NetworkKind>('ok');
  const [recoveredFlash, setRecoveredFlash] = useState(false);
  const wasDegraded = useRef(false);
  const flashTimer = useRef<number | null>(null);

  const evaluate = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      wasDegraded.current = true;
      setKind('offline');
      setRecoveredFlash(false);
      return;
    }
    const ok = await checkApiHealth();
    if (!ok) {
      wasDegraded.current = true;
      setKind('api-down');
      setRecoveredFlash(false);
      return;
    }
    if (wasDegraded.current) {
      wasDegraded.current = false;
      setKind('ok');
      setRecoveredFlash(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setRecoveredFlash(false), 3500);
    } else {
      setKind('ok');
    }
  }, []);

  useEffect(() => {
    void evaluate();
    const id = window.setInterval(() => void evaluate(), 30_000);
    const onOnline = () => void evaluate();
    const onOffline = () => {
      wasDegraded.current = true;
      setKind('offline');
      setRecoveredFlash(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const onVis = () => {
      if (document.visibilityState === 'visible') void evaluate();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVis);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, [evaluate]);

  return { kind, recoveredFlash, retry: evaluate };
}

'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getToken } from '@/lib/api';
import { canUsePush, isPushConfigured, registerServiceWorker, subscribeToPush } from '@/lib/push';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_DISMISSED_KEY = 'dah_pwa_install_dismissed';
const PUSH_DISMISSED_KEY = 'dah_push_dismissed';

export function PwaPrompt() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const evaluatePushPrompt = useCallback(async () => {
    if (
      !canUsePush() ||
      Notification.permission !== 'default' ||
      !getToken() ||
      sessionStorage.getItem(PUSH_DISMISSED_KEY)
    ) {
      setShowPush(false);
      return;
    }

    const configured = await isPushConfigured();
    setShowPush(configured);
  }, []);

  useEffect(() => {
    registerServiceWorker().catch(() => undefined);

    const handler = (e: Event) => {
      e.preventDefault();
      if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return;
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const onAuthChange = () => {
      void evaluatePushPrompt();
    };
    window.addEventListener('dah-auth-change', onAuthChange);
    window.addEventListener('focus', onAuthChange);

    void evaluatePushPrompt();

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('dah-auth-change', onAuthChange);
      window.removeEventListener('focus', onAuthChange);
    };
  }, [evaluatePushPrompt]);

  useEffect(() => {
    void evaluatePushPrompt();
  }, [pathname, evaluatePushPrompt]);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setShowInstall(false);
    setInstallEvent(null);
  }

  function dismissInstall() {
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    setShowInstall(false);
    setInstallEvent(null);
  }

  function dismissPush() {
    sessionStorage.setItem(PUSH_DISMISSED_KEY, '1');
    setShowPush(false);
  }

  async function handlePush() {
    try {
      await subscribeToPush();
      setMessage('Сповіщення увімкнено');
      setMessageIsError(false);
      setShowPush(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Помилка підписки на сповіщення');
      setMessageIsError(true);
    }
  }

  if (!showInstall && !showPush && !message) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        right: '1rem',
        maxWidth: 400,
        margin: '0 auto',
        zIndex: 100,
        display: 'grid',
        gap: '0.5rem',
      }}
    >
      {showInstall && (
        <div className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: '0.9rem' }}>Встановити DAH на екран телефону?</span>
          <button type="button" onClick={handleInstall} style={{ fontSize: '0.85rem' }}>
            Встановити
          </button>
          <button
            type="button"
            onClick={dismissInstall}
            style={{ fontSize: '0.85rem', background: 'var(--surface-2)' }}
          >
            Пізніше
          </button>
        </div>
      )}
      {showPush && (
        <div className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: '0.9rem' }}>Отримувати сповіщення про оголошення?</span>
          <button type="button" onClick={handlePush} style={{ fontSize: '0.85rem' }}>
            Увімкнути
          </button>
          <button
            type="button"
            onClick={dismissPush}
            style={{ fontSize: '0.85rem', background: 'var(--surface-2)' }}
          >
            Ні
          </button>
        </div>
      )}
      {message && (
        <p
          className="card"
          style={{
            textAlign: 'center',
            fontSize: '0.85rem',
            color: messageIsError ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
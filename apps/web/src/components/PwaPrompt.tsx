'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/api';
import { canUsePush, subscribeToPush } from '@/lib/push';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    if (canUsePush() && Notification.permission === 'default' && getToken()) {
      setShowPush(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setShowInstall(false);
    setInstallEvent(null);
  }

  async function handlePush() {
    try {
      const ok = await subscribeToPush();
      setMessage(ok ? 'Сповіщення увімкнено' : 'Не вдалося підписатися');
      setShowPush(false);
    } catch {
      setMessage('Помилка підписки на сповіщення');
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
            onClick={() => setShowInstall(false)}
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
            onClick={() => setShowPush(false)}
            style={{ fontSize: '0.85rem', background: 'var(--surface-2)' }}
          >
            Ні
          </button>
        </div>
      )}
      {message && (
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--success)' }}>{message}</p>
      )}
    </div>
  );
}
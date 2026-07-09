import { apiFetch, getToken } from './api';

export type PushSubscribeError =
  | 'no_token'
  | 'no_vapid'
  | 'denied'
  | 'no_sw'
  | 'invalid_subscription';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function isPushConfigured(): Promise<boolean> {
  try {
    const { publicKey } = await apiFetch<{ publicKey: string | null }>(
      '/notifications/vapid-public-key',
    );
    return Boolean(publicKey);
  } catch {
    return false;
  }
}

export async function subscribeToPush(): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Увійдіть у систему, щоб увімкнути сповіщення');

  const { publicKey } = await apiFetch<{ publicKey: string | null }>(
    '/notifications/vapid-public-key',
  );
  if (!publicKey) {
    throw new Error('Сповіщення не налаштовані на сервері (VAPID ключі)');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Дозвіл на сповіщення не надано');
  }

  const registration = await registerServiceWorker();
  if (!registration) throw new Error('Не вдалося зареєструвати service worker');

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Некоректна підписка браузера');
  }

  await apiFetch('/notifications/subscribe', {
    method: 'POST',
    token,
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }),
  });
}

export function canUsePush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}
import { setAuthCookie, clearAuthCookie } from './auth-cookie';

/** Browser: same-origin /api (nginx or Next rewrite). SSR/build: env fallback. */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('dah_token');
  if (stored) return stored;
  const match = document.cookie.match(/(?:^|; )dah_token=([^;]*)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dah_refresh');
}

function persistTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem('dah_token', accessToken);
  if (refreshToken) localStorage.setItem('dah_refresh', refreshToken);
  setAuthCookie(accessToken);
  window.dispatchEvent(new Event('dah-auth-change'));
}

function clearSession() {
  localStorage.removeItem('dah_token');
  localStorage.removeItem('dah_refresh');
  localStorage.removeItem('dah_user');
  clearAuthCookie();
  window.dispatchEvent(new Event('dah-auth-change'));
}

let refreshInFlight: Promise<string | null> | null = null;

/** Exchange refresh token for a new access token. Single-flight. */
export async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearSession();
        return null;
      }
      const data = (await res.json()) as LoginResponse;
      if (!data.accessToken) {
        clearSession();
        return null;
      }
      persistTokens(data.accessToken, data.refreshToken);
      if (data.user) {
        localStorage.setItem('dah_user', JSON.stringify(data.user));
      }
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/health`, { method: 'GET', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

type ApiFetchOptions = RequestInit & {
  token?: string;
  /** Internal: avoid infinite refresh loops */
  _retried?: boolean;
  /** Skip Authorization header entirely */
  skipAuth?: boolean;
};

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, _retried, skipAuth, ...init } = options;
  const headers: HeadersInit = {
    ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers ?? {}),
  };
  const authToken = skipAuth ? null : token ?? getToken();
  if (authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const apiUrl = getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new Error(
      'Немає зв\'язку з сервером ОСМД. Перевірте мережу, KeenDNS або що API запущено.',
    );
  }

  if (res.status === 401 && !skipAuth && !_retried && !path.startsWith('/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, { ...options, token: newToken, _retried: true });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? `Помилка ${res.status}`),
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function uploadFile(
  path: string,
  file: File,
  token: string,
  folder?: string,
): Promise<{ key: string; url: string }> {
  const form = new FormData();
  form.append('file', file);

  const apiUrl = getApiBaseUrl();
  const url = folder ? `${apiUrl}${path}?folder=${folder}` : `${apiUrl}${path}`;

  let auth = token;
  let res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth}` },
    body: form,
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      auth = newToken;
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth}` },
        body: form,
      });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? 'Помилка завантаження файлу');
  }
  return res.json();
}

export async function downloadReceipt(lineId: string, token: string) {
  const apiUrl = getApiBaseUrl();
  let auth = token;
  let res = await fetch(`${apiUrl}/accruals/lines/${lineId}/receipt`, {
    headers: { Authorization: `Bearer ${auth}` },
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      auth = newToken;
      res = await fetch(`${apiUrl}/accruals/lines/${lineId}/receipt`, {
        headers: { Authorization: `Bearer ${auth}` },
      });
    }
  }

  if (!res.ok) throw new Error('Не вдалося завантажити квитанцію');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kvytantsiia-${lineId.slice(-8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface LoginUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status?: string;
  apartmentId?: string;
}

export interface LoginResponse {
  requires2fa?: boolean;
  tempToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user: LoginUser;
}

import { clearSessionFlagCookie, setSessionFlagCookie } from './auth-cookie';
import { getSelectedTenantId, withBuildingQuery } from './building-context';

const ACCESS_KEY = 'dah_token';
const LEGACY_REFRESH_KEY = 'dah_refresh';

/** Paths that should receive selected multi-building scope. */
const BUILDING_SCOPED_PREFIXES = [
  '/finance/funds',
  '/finance/bank-accounts',
  '/finance/suppliers',
  '/finance/expenses',
  '/finance/reports/',
  '/accruals',
  '/payments',
  '/building/apartments',
  '/building/ops-summary',
  '/journal',
  '/meters',
];

function applyBuildingScope(path: string): string {
  if (typeof window === 'undefined') return path;
  if (path.includes('buildingId=')) return path;
  const pure = path.split('?')[0];
  const scoped = BUILDING_SCOPED_PREFIXES.some(
    (p) => pure === p || pure.startsWith(p) || pure.startsWith(p.replace(/\/$/, '')),
  );
  // Do not scope personal account / auth
  if (pure.startsWith('/accruals/my-account') || pure.startsWith('/accruals/lines/')) {
    return path;
  }
  return scoped ? withBuildingQuery(path) : path;
}

/** Browser: same-origin /api (nginx or Next rewrite). SSR/build: env fallback. */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
}

/**
 * Access token: sessionStorage only (cleared when tab session ends).
 * Refresh: HttpOnly cookie set by API (not readable from JS).
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(ACCESS_KEY);
  } catch {
    return localStorage.getItem(ACCESS_KEY);
  }
}

function persistAccessToken(accessToken: string) {
  try {
    sessionStorage.setItem(ACCESS_KEY, accessToken);
  } catch {
    // ignore
  }
  // Migrate off long-lived localStorage tokens
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  setSessionFlagCookie();
  window.dispatchEvent(new Event('dah-auth-change'));
}

function clearSession() {
  try {
    sessionStorage.removeItem(ACCESS_KEY);
  } catch {
    // ignore
  }
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem('dah_user');
  clearSessionFlagCookie();
  window.dispatchEvent(new Event('dah-auth-change'));
}

/** @deprecated refresh is cookie-based; kept for transitional callers */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LEGACY_REFRESH_KEY);
}

function persistTokens(accessToken: string, _refreshToken?: string) {
  persistAccessToken(accessToken);
}

let refreshInFlight: Promise<string | null> | null = null;

/** Exchange refresh cookie (or legacy body token) for a new access token. Single-flight. */
export async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const legacyRefresh = getRefreshToken();
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(legacyRefresh ? { refreshToken: legacyRefresh } : {}),
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
    const res = await fetch(`${getApiBaseUrl()}/health`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
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

  const scopedPath = applyBuildingScope(path);
  const tenantId = typeof window !== 'undefined' ? getSelectedTenantId() : null;
  if (tenantId) {
    (headers as Record<string, string>)['X-Tenant-Id'] = tenantId;
  }
  const apiUrl = getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${scopedPath}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new Error(
      'Немає зв\'язку з сервером ОСМД. Перевірте мережу, KeenDNS або що API запущено.',
    );
  }

  if (res.status === 401 && !skipAuth && !_retried && !scopedPath.startsWith('/auth/')) {
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
    credentials: 'include',
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      auth = newToken;
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth}` },
        body: form,
        credentials: 'include',
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
    credentials: 'include',
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      auth = newToken;
      res = await fetch(`${apiUrl}/accruals/lines/${lineId}/receipt`, {
        headers: { Authorization: `Bearer ${auth}` },
        credentials: 'include',
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

export { persistAccessToken, clearSession as clearClientSession };

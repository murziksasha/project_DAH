/** Browser: same-origin /api (nginx or Next rewrite). SSR/build: env fallback. */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const apiUrl = getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new Error(
      'Не вдалося підключитися до API. Перевірте, що сервер API запущено (npm run dev:api).',
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? `Помилка ${res.status}`),
    );
  }
  return res.json();
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? 'Помилка завантаження файлу');
  }
  return res.json();
}

export async function downloadReceipt(lineId: string, token: string) {
  const apiUrl = getApiBaseUrl();
  const res = await fetch(`${apiUrl}/accruals/lines/${lineId}/receipt`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Не вдалося завантажити квитанцію');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kvytantsiia-${lineId.slice(-8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
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

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
    apartmentId?: string;
  };
}
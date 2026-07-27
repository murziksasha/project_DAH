import { getApiBaseUrl, getToken, refreshAccessToken } from './api';

/** Authenticated binary download (PDF/ZIP). */
export async function downloadAuthFile(path: string, fallbackName: string) {
  let token = getToken();
  if (!token) throw new Error('Потрібна авторизація');

  const apiUrl = getApiBaseUrl();
  let res = await fetch(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('Сесію завершено');
    token = newToken;
    res = await fetch(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `Помилка ${res.status}`);
  }

  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="?([^";]+)"?/i);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

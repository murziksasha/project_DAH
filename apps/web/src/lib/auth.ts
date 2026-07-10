import { apiFetch, getToken } from './api';
import { clearAuthCookie } from './auth-cookie';

export interface StoredUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

const ADMIN_ROLES = ['chairman', 'accountant', 'board', 'auditor'];

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('dah_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function getRoleHome(role: string, isInitialized = true): string {
  if (role === 'super_admin') {
    return isInitialized ? '/admin/organization' : '/admin/setup';
  }
  if (ADMIN_ROLES.includes(role)) return '/admin';
  if (role === 'resident') return '/resident';
  return '/';
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await apiFetch('/auth/logout', { method: 'POST', token });
    } catch {
      // proceed with local cleanup
    }
  }
  localStorage.removeItem('dah_token');
  localStorage.removeItem('dah_refresh');
  localStorage.removeItem('dah_user');
  clearAuthCookie();
  window.dispatchEvent(new Event('dah-auth-change'));
  window.location.href = '/login';
}
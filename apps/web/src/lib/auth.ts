import { apiFetch, clearClientSession, getToken } from './api';

export interface StoredUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId?: string | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    orgType: 'osbb' | 'management_company' | string;
  } | null;
}

const ADMIN_ROLES = [
  'chairman',
  'accountant',
  'board',
  'dispatcher',
  'crew',
  'auditor',
];

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
  if (role === 'dispatcher') return '/admin/dispatch';
  if (role === 'crew') return '/admin/dispatch';
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
  clearClientSession();
  window.location.href = '/login';
}

export async function logoutAll(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await apiFetch('/auth/logout-all', { method: 'POST', token });
    } catch {
      // proceed
    }
  }
  clearClientSession();
  window.location.href = '/login';
}

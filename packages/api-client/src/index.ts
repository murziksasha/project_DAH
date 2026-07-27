/**
 * Lightweight shared API types for DAH web/admin clients.
 * Full OpenAPI codegen can replace this package later.
 */

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down' | string;
  service: string;
  version?: string;
  db?: string;
  redis?: string;
  storage?: string;
  backup?: {
    status: string;
    lastBackupAt: string | null;
    ageHours: number | null;
  };
  timestamp: string;
}

export interface LoginResponse {
  requires2fa?: boolean;
  tempToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status?: string;
    apartmentId?: string | null;
  };
}

export interface PollStats {
  votedWeight: number;
  eligibleWeight: number;
  participationPercent: number;
  quorumPercent: number | null;
  quorumMet: boolean;
  voteCount: number;
}

export interface AccountTimelineEvent {
  id: string;
  kind: 'accrual' | 'payment';
  at: string;
  title: string;
  amount: number;
  meta?: Record<string, unknown>;
}

export function unwrapPage<T>(data: PageResult<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.items;
}

/**
 * Shared API types for «Мій дім» web/admin clients.
 * L2/L9: `paths`/`components`/`operations` are generated from docs/api/openapi.json
 * (`npm run codegen -w @dah/api-client`); hand-written helpers below stay for compatibility.
 */
import type { paths } from './openapi';

export type { paths, components, operations } from './openapi';

/** Every documented API route, e.g. `'/api/health/ready'`. */
export type ApiPath = keyof paths;

/** HTTP methods available on a route. */
export type ApiMethod<P extends ApiPath> = {
  [M in keyof paths[P]]: paths[P][M] extends undefined | never ? never : M;
}[keyof paths[P]] &
  ('get' | 'post' | 'put' | 'patch' | 'delete');

/** Type-safe route literal helper: `apiPath('/api/health/ready')` fails to compile for unknown routes. */
export function apiPath<P extends ApiPath>(p: P): P {
  return p;
}

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

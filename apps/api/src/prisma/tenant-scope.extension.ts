import { Prisma } from '@prisma/client';
import { currentTenantScope } from '../common/tenant-context/tenant-context';

/**
 * Phase 2.1 — automatic tenant isolation (defense in depth on top of TenantAccessService).
 *
 * Models that carry their own `tenantId` column. Building-scoped models (Apartment,
 * Fund, Accrual…) are protected through Building and the explicit helpers; users and
 * memberships are intentionally excluded (login / organization switch span tenants).
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'Building',
  'Announcement',
  'Request',
  'Poll',
  'Document',
  'Meeting',
  'Reminder',
  'BankStatement',
]);

const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

type Args = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown };

function withTenantData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => withTenantData(d, tenantId));
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    // Respect an explicit tenant (or relation connect) chosen by the service.
    if ('tenantId' in d || 'tenant' in d) return d;
    return { ...d, tenantId };
  }
  return data;
}

/** Pure transform, exported for unit tests. */
export function scopeArgs(model: string | undefined, operation: string, args: Args, tenantId: string | null): Args {
  if (!tenantId || !model || !TENANT_SCOPED_MODELS.has(model)) return args;
  const next: Args = { ...(args ?? {}) };
  if (WHERE_OPS.has(operation)) {
    const where = next.where ?? {};
    // Unique ops need the unique field at top level; extra filters are allowed alongside.
    next.where = operation.startsWith('findUnique') || operation === 'update' || operation === 'delete' || operation === 'upsert'
      ? { ...where, tenantId }
      : { AND: [where, { tenantId }] };
  }
  if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
    next.data = withTenantData(next.data, tenantId);
  }
  if (operation === 'upsert') {
    next.create = withTenantData(next.create, tenantId);
  }
  return next;
}

export const tenantScopeExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        return query(scopeArgs(model, operation, args as Args, currentTenantScope()) as never);
      },
    },
  },
});

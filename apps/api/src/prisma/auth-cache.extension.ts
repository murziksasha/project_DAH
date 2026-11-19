import { Prisma } from '@prisma/client';
import { invalidateAuthCache } from '../common/auth-cache';

/** Models whose writes can change who is authenticated / with which role. */
const AUTH_MODELS = new Set(['User', 'AuthSession', 'TenantMembership', 'Tenant']);
const WRITE_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * M18: revoke/deactivate/role change must not wait for AUTH_CACHE_TTL_MS in this process.
 * Any write to auth models clears the (small) principal cache. Multi-instance deployments
 * still see up to TTL delay on other instances — keep the TTL short (docs/UPGRADE-phase2.md).
 */
export const authCacheInvalidationExtension = Prisma.defineExtension({
  name: 'auth-cache-invalidation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        if (model && AUTH_MODELS.has(model) && WRITE_OPS.has(operation)) invalidateAuthCache();
        return result;
      },
    },
  },
});

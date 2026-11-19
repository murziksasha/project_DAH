import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { tenantScopeExtension } from './tenant-scope.extension';
import { authCacheInvalidationExtension } from './auth-cache.extension';

/**
 * PrismaService is the base client extended with automatic tenant scoping (Phase 2.1).
 * TENANT_AUTO_SCOPE=false switches the extension off (emergency escape hatch).
 */
export function createPrismaService(): PrismaService {
  const base = new PrismaService();
  const withCache = base.$extends(authCacheInvalidationExtension);
  if (process.env.TENANT_AUTO_SCOPE === 'false') return withCache as unknown as PrismaService;
  return withCache.$extends(tenantScopeExtension) as unknown as PrismaService;
}

@Global()
@Module({
  providers: [{ provide: PrismaService, useFactory: createPrismaService }],
  exports: [PrismaService],
})
export class PrismaModule {}

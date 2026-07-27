import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './current-user.decorator';
import { resolveTenantId } from '../utils/tenant-scope';

/**
 * Effective tenant for the request:
 * - normal users: JWT tenantId
 * - super_admin: X-Tenant-Id header or ?tenantId= (optional, null = all)
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<{
      user?: AuthUser;
      headers: Record<string, string | string[] | undefined>;
      query: Record<string, string | undefined>;
    }>();
    const user = req.user;
    if (!user) return null;
    const headerRaw = req.headers['x-tenant-id'];
    const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
    const query = req.query?.tenantId;
    return resolveTenantId(user, header || query || null);
  },
);

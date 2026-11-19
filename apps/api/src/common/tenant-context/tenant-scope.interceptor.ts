import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../decorators/current-user.decorator';
import { resolveTenantId } from '../utils/tenant-scope';
import { runWithTenantScope } from './tenant-context';

/** Runs every authenticated request inside its tenant scope (after guards). */
@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const user = req.user;
    if (!user) return next.handle();
    let tenantId: string | null;
    try {
      const raw = req.headers['x-tenant-id'];
      tenantId = resolveTenantId(user, (Array.isArray(raw) ? raw[0] : raw) || null);
    } catch {
      tenantId = user.tenantId ?? null;
    }
    return new Observable((subscriber) =>
      runWithTenantScope(tenantId, () => next.handle().subscribe(subscriber)),
    );
  }
}

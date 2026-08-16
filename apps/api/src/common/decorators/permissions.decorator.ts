import { SetMetadata } from '@nestjs/common';
import { Permission } from '@dah/shared';

export const PERMISSIONS_KEY = 'permissions';

/** Require any of the listed permissions (OR). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

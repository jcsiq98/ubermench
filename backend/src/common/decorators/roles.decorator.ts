import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to specific user roles (CUSTOMER, PROVIDER, ADMIN).
 * Requires RolesGuard to be applied (either per-controller or globally).
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

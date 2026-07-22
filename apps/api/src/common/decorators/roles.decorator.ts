import { SetMetadata } from '@nestjs/common';
import { SharedAccountRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: SharedAccountRole[]) => SetMetadata(ROLES_KEY, roles);

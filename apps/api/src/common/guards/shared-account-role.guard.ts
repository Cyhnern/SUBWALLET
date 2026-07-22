import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SharedAccountRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * İstek parametresindeki `id` (ortak hesap ID'si) üzerinden kullanıcının
 * üyeliğini ve rolünü doğrular. @Roles() dekoratörü verilmemişse sadece
 * üyelik kontrolü yapılır (herhangi bir rol yeterlidir).
 */
@Injectable()
export class SharedAccountRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<SharedAccountRole[]>(
      ROLES_KEY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const sharedAccountId = request.params.id;

    const membership = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId: user.id } },
    });

    if (!membership) {
      throw new ForbiddenException('Bu ortak hesaba erişiminiz yok');
    }

    if (requiredRoles?.length && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Bu işlem için yeterli yetkiniz yok');
    }

    request.sharedAccountMembership = membership; // controller/service tekrar sorgu atmasın diye
    return true;
  }
}

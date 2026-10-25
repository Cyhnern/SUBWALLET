import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSharedAccountDto } from './dto/create-shared-account.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class SharedAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateSharedAccountDto) {
    return this.prisma.sharedAccount.create({
      data: {
        name: dto.name,
        ownerId,
        members: { create: { userId: ownerId, role: 'owner' } },
      },
      include: { members: true },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.sharedAccount.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrFail(id: string) {
    const account = await this.prisma.sharedAccount.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
        subscriptions: { where: { deletedAt: null } },
      },
    });
    if (!account) throw new NotFoundException('Ortak hesap bulunamadı');
    return account;
  }

  async inviteMember(sharedAccountId: string, dto: InviteMemberDto) {
    const targetUser = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (!targetUser) {
      throw new NotFoundException(
        'Bu e-postayla kayıtlı bir kullanıcı bulunamadı.',
      );
    }

    const existing = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId: targetUser.id } },
    });
    if (existing) throw new ConflictException('Kullanıcı zaten bu ortak hesabın üyesi');

    return this.prisma.sharedAccountMember.create({
      data: { sharedAccountId, userId: targetUser.id, role: dto.role ?? 'member' },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async removeMember(sharedAccountId: string, targetUserId: string, actor: { userId: string; role: string }) {
    const target = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Üyelik bulunamadı');

    if (actor.role === 'admin') {
      if (target.role === 'owner' || target.role === 'admin') {
        throw new ForbiddenException('Admin, başka bir admini veya hesap sahibini çıkaramaz');
      }
    }

    if (target.role === 'owner') {
      throw new BadRequestException(
        'Hesap sahibi çıkarılamaz. Önce sahipliği başka bir üyeye devretmelisiniz.',
      );
    }

    await this.prisma.sharedAccountMember.delete({
      where: { sharedAccountId_userId: { sharedAccountId, userId: targetUserId } },
    });
  }

  async leaveAccount(sharedAccountId: string, userId: string) {
    const membership = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId } },
    });
    if (!membership) throw new NotFoundException('Üyelik bulunamadı');

    if (membership.role === 'owner') {
      throw new BadRequestException(
        'Hesap sahibi ayrılamaz. Önce sahipliği başka bir üyeye devretmelisiniz.',
      );
    }

    await this.prisma.sharedAccountMember.delete({
      where: { sharedAccountId_userId: { sharedAccountId, userId } },
    });
    return { message: 'Ortak hesaptan başarıyla ayrıldınız' };
  }

  async transferOwnership(sharedAccountId: string, ownerUserId: string, newOwnerId: string) {
    const account = await this.findOneOrFail(sharedAccountId);
    if (account.ownerId !== ownerUserId) {
      throw new ForbiddenException('Yalnızca hesap sahibi sahipliği devredebilir');
    }

    const newOwnerMembership = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId: newOwnerId } },
    });
    if (!newOwnerMembership) {
      throw new NotFoundException('Yeni sahip bu hesabın üyesi olmalı');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.sharedAccount.update({
        where: { id: sharedAccountId },
        data: { ownerId: newOwnerId },
      });
      await tx.sharedAccountMember.update({
        where: { sharedAccountId_userId: { sharedAccountId, userId: ownerUserId } },
        data: { role: 'admin' },
      });
      await tx.sharedAccountMember.update({
        where: { sharedAccountId_userId: { sharedAccountId, userId: newOwnerId } },
        data: { role: 'owner' },
      });
    });
  }

  // ============================================
  // MALİYET PAYLAŞIMI HESAPLAMA MOTORU
  // ============================================

  async recomputeCostSplits(sharedAccountId: string, billingPeriodStart: Date) {
    const account = await this.findOneOrFail(sharedAccountId);
    const memberIds = account.members.map((m) => m.userId);
    if (memberIds.length === 0) {
      throw new BadRequestException('Hesapta üye bulunmuyor');
    }

    const results: any[] = [];
    for (const sub of account.subscriptions) {
      if (sub.status !== 'active') continue;

      const splits = this.computeSplitsForSubscription(Number(sub.price), memberIds);

      for (const split of splits) {
        const existing = await this.prisma.costSplit.findUnique({
          where: {
            subscriptionId_userId_billingPeriodStart: {
              subscriptionId: sub.id,
              userId: split.userId,
              billingPeriodStart,
            },
          },
        });

        if (existing?.isSettled) {
          results.push(existing);
          continue;
        }

        const record = await this.prisma.costSplit.upsert({
          where: {
            subscriptionId_userId_billingPeriodStart: {
              subscriptionId: sub.id,
              userId: split.userId,
              billingPeriodStart,
            },
          },
          create: {
            subscriptionId: sub.id,
            userId: split.userId,
            splitType: 'equal',
            computedAmount: new Prisma.Decimal(split.amount),
            billingPeriodStart,
          },
          update: {
            computedAmount: new Prisma.Decimal(split.amount),
          },
        });
        results.push(record);
      }
    }

    return results;
  }

  private computeSplitsForSubscription(
    price: number,
    memberIds: string[],
  ): { userId: string; amount: number }[] {
    const perMember = Math.round((price / memberIds.length) * 100) / 100;
    const totalRounded = perMember * (memberIds.length - 1);
    const lastMemberAmount = Math.round((price - totalRounded) * 100) / 100;

    return memberIds.map((userId, index) => ({
      userId,
      amount: index === memberIds.length - 1 ? lastMemberAmount : perMember,
    }));
  }

  async listCostSplits(sharedAccountId: string, billingPeriodStart?: Date) {
    return this.prisma.costSplit.findMany({
      where: {
        subscription: { sharedAccountId },
        ...(billingPeriodStart ? { billingPeriodStart } : {}),
      },
      include: {
        subscription: { select: { id: true, customName: true, serviceProvider: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { billingPeriodStart: 'desc' },
    });
  }

  async settleCostSplit(sharedAccountId: string, splitId: string, requestingUserId: string) {
    const { count } = await this.prisma.costSplit.updateMany({
      where: {
        id: splitId,
        userId: requestingUserId,
        isSettled: false,
        subscription: { sharedAccountId },
      },
      data: { isSettled: true, settledAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException('Maliyet payı bulunamadı veya bu işlem için yetkiniz yok');
    }

    return { message: 'Ödeme başarılı şekilde ödendi olarak işaretlendi' };
  }
}

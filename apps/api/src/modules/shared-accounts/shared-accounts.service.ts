import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

  /** Yalnızca owner/admin çağırabilir (Guard katmanında zorlanır). */
  async inviteMember(sharedAccountId: string, dto: InviteMemberDto) {
    const targetUser = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (!targetUser) {
      throw new NotFoundException(
        'Bu e-postayla kayıtlı bir kullanıcı bulunamadı. Davet e-postası gönderimi yakında eklenecek.',
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

  /** Yalnızca owner/admin çağırabilir; owner kendisini çıkaramaz (hesap sahipsiz kalmasın). */
  async removeMember(sharedAccountId: string, memberUserId: string) {
    const membership = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId: memberUserId } },
    });
    if (!membership) throw new NotFoundException('Üyelik bulunamadı');
    if (membership.role === 'owner') {
      throw new BadRequestException(
        'Hesap sahibi çıkarılamaz. Önce sahipliği başka bir üyeye devretmelisiniz.',
      );
    }

    await this.prisma.sharedAccountMember.delete({
      where: { sharedAccountId_userId: { sharedAccountId, userId: memberUserId } },
    });
  }

  // ============================================
  // MALİYET PAYLAŞIMI HESAPLAMA MOTORU
  // ============================================

  /**
   * Bir ortak hesaba bağlı tüm aktif aboneliklerin, belirli bir fatura dönemi
   * için üyeler arasında nasıl bölüşüldüğünü hesaplar ve `cost_splits`
   * tablosuna yazar (idempotent — ödenmiş/settled kayıtlar dondurulur).
   */
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
        // Settled (ödenmiş) kayıtlar dondurulur — dondurulmuş kayıtların üzerine yazılamaz
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

  async settleCostSplit(splitId: string, requestingUserId: string) {
    const split = await this.prisma.costSplit.findUnique({ where: { id: splitId } });
    if (!split) throw new NotFoundException('Ödeme kaydı bulunamadı');

    if (split.userId !== requestingUserId) {
      throw new BadRequestException('Yalnızca kendi payınızı ödendi olarak işaretleyebilirsiniz');
    }

    return this.prisma.costSplit.update({
      where: { id: splitId },
      data: { isSettled: true, settledAt: new Date() },
    });
  }
}

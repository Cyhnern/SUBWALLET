import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { startOfUtcDay, utcHorizonEnd } from '../../common/date.util';
import { calculateNextBillingDate } from './billing-cycle.util';

const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ['active', 'cancelled'],
  active: ['paused', 'cancelled', 'expired'],
  paused: ['active', 'cancelled'],
  cancelled: [],
  expired: ['active'],
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSubscriptionDto) {
    if (dto.invoiceUrl && !dto.invoiceUrl.toLowerCase().startsWith('https://')) {
      throw new BadRequestException('invoiceUrl yalnızca güvenli https:// protokolünü destekler');
    }

    const startDate = new Date(dto.startDate);
    const nextBillingDate = calculateNextBillingDate(
      startDate,
      dto.billingCycle,
      dto.customCycleDays,
    );

    if (dto.sharedAccountId) {
      const membership = await this.prisma.sharedAccountMember.findUnique({
        where: { sharedAccountId_userId: { sharedAccountId: dto.sharedAccountId, userId } },
      });
      if (!membership) {
        throw new ForbiddenException('Bu ortak hesaba abonelik ekleme yetkiniz yok');
      }
    }

    return this.prisma.subscription.create({
      data: {
        ...dto,
        userId,
        startDate,
        nextBillingDate,
        status: dto.trialEndDate ? 'trial' : 'active',
      },
      include: { serviceProvider: true, category: true },
    });
  }

  async findAllForUser(
    userId: string,
    filters: { status?: SubscriptionStatus; categoryId?: string; sharedAccountId?: string },
  ) {
    if (filters.sharedAccountId) {
      const membership = await this.prisma.sharedAccountMember.findUnique({
        where: { sharedAccountId_userId: { sharedAccountId: filters.sharedAccountId, userId } },
      });
      if (!membership) {
        throw new ForbiddenException('Bu ortak hesaba erişim yetkiniz yok');
      }
    }

    return this.prisma.subscription.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          ...(filters.sharedAccountId
            ? [{ sharedAccountId: filters.sharedAccountId }]
            : []),
        ],
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      },
      include: { serviceProvider: true, category: true },
      orderBy: { nextBillingDate: 'asc' },
    });
  }

  async findOneOrFail(userId: string, id: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, deletedAt: null },
      include: { serviceProvider: true, category: true, sharedAccount: true },
    });
    if (!sub) throw new NotFoundException('Abonelik bulunamadı');

    const hasAccess =
      sub.userId === userId ||
      (sub.sharedAccountId &&
        (await this.prisma.sharedAccountMember.findUnique({
          where: { sharedAccountId_userId: { sharedAccountId: sub.sharedAccountId, userId } },
        })));
    if (!hasAccess) throw new ForbiddenException('Bu aboneliğe erişiminiz yok');

    return sub;
  }

  async update(userId: string, id: string, dto: UpdateSubscriptionDto) {
    const existing = await this.findOneOrFail(userId, id);

    if (dto.invoiceUrl && !dto.invoiceUrl.toLowerCase().startsWith('https://')) {
      throw new BadRequestException('invoiceUrl yalnızca güvenli https:// protokolünü destekler');
    }

    if (existing.sharedAccountId) {
      const membership = await this.prisma.sharedAccountMember.findUnique({
        where: { sharedAccountId_userId: { sharedAccountId: existing.sharedAccountId, userId } },
      });
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new ForbiddenException(
          'Yalnızca grup yöneticileri veya hesap sahibi ortak abonelikte değişiklik yapabilir',
        );
      }
    }

    const priceChanged = dto.price !== undefined && Number(existing.price) !== dto.price;
    const cycleChanged = dto.billingCycle && dto.billingCycle !== existing.billingCycle;

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.subscription.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
          ...(cycleChanged
            ? {
                nextBillingDate: calculateNextBillingDate(
                  new Date(),
                  dto.billingCycle!,
                  dto.customCycleDays,
                ),
              }
            : {}),
        },
      });

      if (priceChanged) {
        await tx.subscriptionHistory.create({
          data: {
            subscriptionId: id,
            changedField: 'price',
            oldValue: String(existing.price),
            newValue: String(dto.price),
          },
        });
      }
      if (cycleChanged) {
        await tx.subscriptionHistory.create({
          data: {
            subscriptionId: id,
            changedField: 'billing_cycle',
            oldValue: existing.billingCycle,
            newValue: dto.billingCycle,
          },
        });
      }
      return record;
    });

    return updated;
  }

  async softDelete(userId: string, id: string) {
    const existing = await this.findOneOrFail(userId, id);
    if (existing.sharedAccountId) {
      const membership = await this.prisma.sharedAccountMember.findUnique({
        where: { sharedAccountId_userId: { sharedAccountId: existing.sharedAccountId, userId } },
      });
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new ForbiddenException(
          'Yalnızca grup yöneticileri veya hesap sahibi ortak aboneliği silebilir',
        );
      }
    }

    return this.prisma.subscription.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async transitionStatus(userId: string, id: string, newStatus: SubscriptionStatus) {
    const sub = await this.findOneOrFail(userId, id);

    if (sub.sharedAccountId) {
      const membership = await this.prisma.sharedAccountMember.findUnique({
        where: { sharedAccountId_userId: { sharedAccountId: sub.sharedAccountId, userId } },
      });
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new ForbiddenException(
          'Yalnızca grup yöneticileri veya hesap sahibi ortak aboneliğin durumunu değiştirebilir',
        );
      }
    }

    if (!ALLOWED_TRANSITIONS[sub.status].includes(newStatus)) {
      throw new BadRequestException(
        `'${sub.status}' durumundan '${newStatus}' durumuna geçiş yapılamaz`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: newStatus,
          ...(newStatus === 'cancelled' ? { cancelledAt: new Date() } : {}),
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: id,
          changedField: 'status',
          oldValue: sub.status,
          newValue: newStatus,
        },
      });
      return updated;
    });
  }

  async markUsed(userId: string, id: string) {
    await this.findOneOrFail(userId, id);
    return this.prisma.subscription.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  async getHistory(userId: string, id: string) {
    await this.findOneOrFail(userId, id);
    return this.prisma.subscriptionHistory.findMany({
      where: { subscriptionId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  async findRenewingWithin(days: number) {
    const start = startOfUtcDay();
    const horizon = utcHorizonEnd(days);

    return this.prisma.subscription.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        nextBillingDate: { gte: start, lte: horizon },
      },
      include: { user: { include: { notificationPreference: true } } },
    });
  }
}

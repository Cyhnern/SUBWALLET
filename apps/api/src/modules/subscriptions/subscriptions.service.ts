import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SubscriptionStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { startOfUtcDay, utcHorizonEnd } from '../../common/date.util';
import { nextBillingDateOnOrAfter } from './billing-cycle.util';

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

  private async assertReferencesAllowed(
    userId: string,
    dto: { categoryId?: string; serviceProviderId?: string },
  ) {
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category || (!category.isSystem && category.userId !== userId)) {
        throw new BadRequestException('Geçersiz kategori');
      }
    }
    if (dto.serviceProviderId) {
      const provider = await this.prisma.serviceProvider.findUnique({
        where: { id: dto.serviceProviderId },
      });
      if (!provider) {
        throw new BadRequestException('Geçersiz servis sağlayıcı');
      }
    }
  }

  async create(userId: string, dto: CreateSubscriptionDto) {
    await this.assertReferencesAllowed(userId, dto);

    const startDate = startOfUtcDay(new Date(dto.startDate));
    const trialEndDate = dto.trialEndDate ? startOfUtcDay(new Date(dto.trialEndDate)) : null;

    const nextBillingDate = trialEndDate
      ? trialEndDate
      : nextBillingDateOnOrAfter(startDate, dto.billingCycle, dto.customCycleDays, startOfUtcDay());

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
        trialEndDate,
        nextBillingDate,
        status: trialEndDate ? 'trial' : 'active',
      },
      include: { serviceProvider: true, category: true },
    });
  }

  async findAllForUser(
    userId: string,
    filters: {
      status?: SubscriptionStatus;
      categoryId?: string;
      sharedAccountId?: string;
      search?: string;
      sortBy?: 'nextBillingDate' | 'priceAsc' | 'priceDesc' | 'nameAsc' | 'nameDesc';
      paymentMethod?: PaymentMethod;
      limit?: number;
      cursor?: string;
    },
  ) {
    if (filters.sharedAccountId) {
      const membership = await this.prisma.sharedAccountMember.findUnique({
        where: { sharedAccountId_userId: { sharedAccountId: filters.sharedAccountId, userId } },
      });
      if (!membership) {
        throw new ForbiddenException('Bu ortak hesaba erişim yetkiniz yok');
      }
    }

    const searchTrimmed = filters.search?.trim();

    let orderBy: any = { nextBillingDate: 'asc' };
    if (filters.sortBy === 'priceAsc') {
      orderBy = { price: 'asc' };
    } else if (filters.sortBy === 'priceDesc') {
      orderBy = { price: 'desc' };
    } else if (filters.sortBy === 'nameAsc') {
      orderBy = { customName: 'asc' };
    } else if (filters.sortBy === 'nameDesc') {
      orderBy = { customName: 'desc' };
    }

    const scope: Prisma.SubscriptionWhereInput = {
      OR: [
        { userId },
        ...(filters.sharedAccountId ? [{ sharedAccountId: filters.sharedAccountId }] : []),
      ],
    };

    const searchFilter: Prisma.SubscriptionWhereInput | undefined = searchTrimmed
      ? {
          OR: [
            { customName: { contains: searchTrimmed, mode: 'insensitive' } },
            { notes: { contains: searchTrimmed, mode: 'insensitive' } },
            { serviceProvider: { name: { contains: searchTrimmed, mode: 'insensitive' } } },
          ],
        }
      : undefined;

    const limit = filters.limit ?? 20;
    const take = limit + 1;

    const items = await this.prisma.subscription.findMany({
      take,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
      where: {
        deletedAt: null,
        AND: [scope, ...(searchFilter ? [searchFilter] : [])],
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
      },
      include: { serviceProvider: true, category: true },
      orderBy,
    });

    let nextCursor: string | undefined = undefined;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
    }

    return {
      items,
      nextCursor,
    };
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
    await this.assertReferencesAllowed(userId, dto);

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
    const customCycleDaysChanged =
      dto.customCycleDays !== undefined && dto.customCycleDays !== existing.customCycleDays;
    const startDateChanged =
      dto.startDate !== undefined &&
      new Date(dto.startDate).getTime() !== new Date(existing.startDate).getTime();

    const shouldRecalculateNextBillingDate =
      cycleChanged || customCycleDaysChanged || startDateChanged;

    const startDate = dto.startDate ? startOfUtcDay(new Date(dto.startDate)) : existing.startDate;
    const cycle = dto.billingCycle ?? existing.billingCycle;
    const customCycleDays = dto.customCycleDays ?? existing.customCycleDays;

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.subscription.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.startDate ? { startDate } : {}),
          ...(shouldRecalculateNextBillingDate
            ? {
                nextBillingDate: nextBillingDateOnOrAfter(
                  startDate,
                  cycle,
                  customCycleDays,
                  startOfUtcDay(),
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

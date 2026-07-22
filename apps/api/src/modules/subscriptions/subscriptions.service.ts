import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { calculateNextBillingDate } from './billing-cycle.util';

// Modelde teknik olarak izin verilse de iş kuralı olarak izin verdiğimiz geçişler.
const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ['active', 'cancelled'],
  active: ['paused', 'cancelled', 'expired'],
  paused: ['active', 'cancelled'],
  cancelled: [],
  expired: ['active'], // kullanıcı ödeme yöntemini günceller ve yeniden etkinleştirir
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSubscriptionDto) {
    const startDate = new Date(dto.startDate);
    const nextBillingDate = calculateNextBillingDate(
      startDate,
      dto.billingCycle,
      dto.customCycleDays,
    );

    // Ortak hesaba ekleniyorsa üyelik doğrulaması yapılmalı — Guard katmanında da kontrol edilir,
    // burada ikinci bir savunma hattı (defense in depth) olarak tekrar doğrulanır.
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
    });
  }

  async findAllForUser(
    userId: string,
    filters: { status?: SubscriptionStatus; categoryId?: string; sharedAccountId?: string },
  ) {
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

    // Fiyat veya döngü değişirse next_billing_date yeniden hesaplanır ve geçmişe düşülür.
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
    await this.findOneOrFail(userId, id);
    return this.prisma.subscription.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Merkezi durum geçiş kapısı — tüm pause/resume/cancel akışları buradan geçer. */
  async transitionStatus(userId: string, id: string, newStatus: SubscriptionStatus) {
    const sub = await this.findOneOrFail(userId, id);

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

  /** BullMQ zamanlayıcısının kullandığı sorgu — belirli gün aralığında yenilenecek aktif abonelikler. */
  async findRenewingWithin(days: number) {
    const today = new Date();
    const horizon = new Date();
    horizon.setDate(today.getDate() + days);

    return this.prisma.subscription.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        nextBillingDate: { gte: today, lte: horizon },
      },
      include: { user: { include: { notificationPreference: true } } },
    });
  }
}

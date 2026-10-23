import { Injectable, Logger } from '@nestjs/common';
import { differenceInCalendarDays, isPast, subDays } from 'date-fns';
import { Subscription } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface ZombieScore {
  subscriptionId: string;
  name: string;
  score: number;
  isZombie: boolean;
  reasons: string[];
}

function displayName(sub: Subscription & { serviceProvider?: { name: string } | null }): string {
  return sub.serviceProvider?.name ?? sub.customName ?? 'İsimsiz Abonelik';
}

const ZOMBIE_THRESHOLD = 50;
const INACTIVITY_DAYS = 30;
const PRICE_INCREASE_LOOKBACK_DAYS = 90;
const PRICE_INCREASE_THRESHOLD_PERCENT = 20;

@Injectable()
export class ZombieDetectorService {
  private readonly logger = new Logger(ZombieDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async scoreSubscription(sub: Subscription): Promise<ZombieScore> {
    let score = 0;
    const reasons: string[] = [];

    // Sinyal 1 (%40): uzun süredir kullanılmadı ya da hiç işaretlenmedi (Infinity kullanılmaz)
    if (!sub.lastUsedAt) {
      score += 40;
      reasons.push('Henüz hiç kullanılmadı veya işaretlenmedi');
    } else {
      const daysSinceUse = differenceInCalendarDays(new Date(), sub.lastUsedAt);
      if (daysSinceUse >= INACTIVITY_DAYS) {
        score += 40;
        reasons.push(`${INACTIVITY_DAYS}+ gündür kullanılmadı`);
      }
    }

    // Sinyal 2 (%25): son 90 günde fiyat %20+ arttı
    const priceIncreasePercent = await this.getPriceIncreasePercent(
      sub.id,
      PRICE_INCREASE_LOOKBACK_DAYS,
    );
    if (priceIncreasePercent >= PRICE_INCREASE_THRESHOLD_PERCENT) {
      score += 25;
      reasons.push(`Son ${PRICE_INCREASE_LOOKBACK_DAYS} günde fiyat %${priceIncreasePercent} arttı`);
    }

    // Sinyal 3 (%20): aynı kategoride 2+ aktif abonelik (mükerrer harcama şüphesi)
    if (sub.categoryId) {
      const siblingCount = await this.prisma.subscription.count({
        where: {
          userId: sub.userId,
          categoryId: sub.categoryId,
          status: 'active',
          deletedAt: null,
          id: { not: sub.id },
        },
      });
      if (siblingCount >= 1) {
        score += 20;
        reasons.push('Aynı kategoride birden fazla aktif abonelik');
      }
    }

    // Sinyal 4 (%15): deneme süresi bitti ama hâlâ ücretli devam ediyor
    if (sub.trialEndDate && isPast(sub.trialEndDate) && sub.status === 'active') {
      score += 15;
      reasons.push('Deneme süresi bitti, hâlâ ücretli devam ediyor');
    }

    return {
      subscriptionId: sub.id,
      name: displayName(sub),
      score,
      isZombie: score >= ZOMBIE_THRESHOLD,
      reasons,
    };
  }

  private async getPriceIncreasePercent(subscriptionId: string, lookbackDays: number): Promise<number> {
    const priceChanges = await this.prisma.subscriptionHistory.findMany({
      where: {
        subscriptionId,
        changedField: 'price',
        changedAt: { gte: subDays(new Date(), lookbackDays) },
      },
      orderBy: { changedAt: 'asc' },
    });
    if (priceChanges.length === 0) return 0;

    const oldest = Number(priceChanges[0].oldValue);
    const newest = Number(priceChanges[priceChanges.length - 1].newValue);
    if (!oldest || oldest === 0) return 0;

    return Math.round(((newest - oldest) / oldest) * 100);
  }

  async scanForUser(userId: string): Promise<ZombieScore[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId, status: 'active', deletedAt: null },
      include: { serviceProvider: true },
    });

    const scores = await Promise.all(subs.map((s) => this.scoreSubscription(s)));
    return scores.filter((s) => s.isZombie);
  }

  async scanAllAndNotify(): Promise<{ scanned: number; flagged: number }> {
    const activeSubs = await this.prisma.subscription.findMany({
      where: { status: 'active', deletedAt: null },
      include: { user: { include: { notificationPreference: true } }, serviceProvider: true },
    });

    let flagged = 0;
    for (const sub of activeSubs) {
      const result = await this.scoreSubscription(sub);
      if (!result.isZombie) continue;

      const alertsEnabled = sub.user.notificationPreference?.zombieAlertsEnabled ?? true;
      if (!alertsEnabled) continue;

      await this.notifications.send({
        userId: sub.userId,
        channels: sub.user.notificationPreference?.channels ?? ['push'],
        type: 'zombie_detected',
        subscriptionId: sub.id,
        payload: { reasons: result.reasons, score: result.score },
      });
      flagged++;
    }

    this.logger.log(`Zombi taraması tamamlandı: ${activeSubs.length} tarandı, ${flagged} işaretlendi`);
    return { scanned: activeSubs.length, flagged };
  }
}

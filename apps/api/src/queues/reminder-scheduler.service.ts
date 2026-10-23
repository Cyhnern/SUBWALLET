import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { differenceInCalendarDays } from 'date-fns';
import { SubscriptionsService } from '../modules/subscriptions/subscriptions.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { calculateNextBillingDate } from '../modules/subscriptions/billing-cycle.util';
import { startOfUtcDay } from '../common/date.util';

export interface RenewalReminderJobData {
  subscriptionId: string;
  userId: string;
  daysUntil: number;
}

const REMINDER_HORIZON_DAYS = 7;

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectQueue('reminders') private readonly queue: Queue<RenewalReminderJobData>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async scheduleUpcomingReminders() {
    const candidates = await this.subscriptionsService.findRenewingWithin(REMINDER_HORIZON_DAYS);
    this.logger.log(`${candidates.length} abonelik yenileme penceresinde tarandı`);

    let queued = 0;
    for (const sub of candidates) {
      const daysUntil = differenceInCalendarDays(sub.nextBillingDate, new Date());
      const prefs = sub.user.notificationPreference;
      const preferredDays = prefs?.daysBeforeRenewal ?? [3, 1];

      if (!preferredDays.includes(daysUntil)) continue;

      const dateStr = new Date(sub.nextBillingDate).toISOString().slice(0, 10);
      // jobId ile idempotency: abonelik ID + fatura tarihi + kalan gün sayısı
      await this.queue.add(
        'send-renewal-reminder',
        { subscriptionId: sub.id, userId: sub.userId, daysUntil },
        { jobId: `reminder-${sub.id}-${dateStr}-${daysUntil}` },
      );
      queued++;
    }
    this.logger.log(`${queued} hatırlatıcı iş kuyruğa eklendi`);
  }

  // Her gün gece yarısı 00:00'da çalışır: yenileme tarihi geçmiş aktif aboneliklerin nextBillingDate değerini ilerletir.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async advanceOverdueBillingDates() {
    const today = startOfUtcDay();
    const overdueSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        nextBillingDate: { lt: today },
      },
    });

    let count = 0;
    for (const sub of overdueSubs) {
      let nextDate = new Date(sub.nextBillingDate);
      while (nextDate < today) {
        nextDate = calculateNextBillingDate(nextDate, sub.billingCycle, sub.customCycleDays);
      }
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { nextBillingDate: nextDate },
      });
      count++;
    }
    this.logger.log(`${count} adet gecikmiş aboneliğin nextBillingDate değeri ilerletildi`);
  }
}

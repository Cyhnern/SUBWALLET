import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { differenceInCalendarDays } from 'date-fns';
import { SubscriptionsService } from '../modules/subscriptions/subscriptions.service';

export interface RenewalReminderJobData {
  subscriptionId: string;
  userId: string;
  daysUntil: number;
}

const REMINDER_HORIZON_DAYS = 7; // en uzak hatırlatıcı tercihinden büyük veya eşit olmalı

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectQueue('reminders') private readonly queue: Queue<RenewalReminderJobData>,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  // Her gün UTC 07:00'de çalışır. Zaman dilimi farkı olan kullanıcılar için
  // ileri fazda kullanıcı bazlı zamanlama eklenebilir (şimdilik basit ve öngörülebilir).
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

      // jobId ile idempotency: aynı abonelik + gün kombinasyonu için tekrar kuyruklanmaz.
      await this.queue.add(
        'send-renewal-reminder',
        { subscriptionId: sub.id, userId: sub.userId, daysUntil },
        { jobId: `reminder-${sub.id}-${daysUntil}` },
      );
      queued++;
    }
    this.logger.log(`${queued} hatırlatıcı iş kuyruğa eklendi`);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { differenceInCalendarDays } from 'date-fns';
import { SubscriptionsService } from '../modules/subscriptions/subscriptions.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { nextBillingDateOnOrAfter } from '../modules/subscriptions/billing-cycle.util';
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
      try {
        const daysUntil = differenceInCalendarDays(sub.nextBillingDate, new Date());
        const prefs = sub.user.notificationPreference;
        const preferredDays = prefs?.daysBeforeRenewal ?? [3, 1];

        if (!preferredDays.includes(daysUntil)) continue;

        const dateStr = new Date(sub.nextBillingDate).toISOString().slice(0, 10);
        await this.queue.add(
          'send-renewal-reminder',
          { subscriptionId: sub.id, userId: sub.userId, daysUntil },
          { jobId: `reminder-${sub.id}-${dateStr}-${daysUntil}` },
        );
        queued++;
      } catch (err) {
        this.logger.error(`Hatırlatıcı iş ekleme hatası (subId=${sub.id}): ${err}`);
      }
    }
    this.logger.log(`${queued} hatırlatıcı iş kuyruğa eklendi`);
  }

  // Her gün gece yarısı 00:00'da çalışır: yenileme tarihi geçmiş aktif aboneliklerin nextBillingDate değerini
  // anchor (startDate) üzerinden ilerletir ve deneme süresi biten abonelikleri trial -> active duruma geçirir.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async advanceOverdueBillingDates() {
    const today = startOfUtcDay();

    // 1. Gecikmiş aktif aboneliklerin fatura tarihlerini anchor (startDate) üzerinden ilerlet
    const overdueSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        nextBillingDate: { lt: today },
      },
    });

    let count = 0;
    let errorCount = 0;
    for (const sub of overdueSubs) {
      try {
        const nextDate = nextBillingDateOnOrAfter(
          sub.startDate,
          sub.billingCycle,
          sub.customCycleDays,
          today,
        );
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { nextBillingDate: nextDate },
        });
        count++;
      } catch (err) {
        errorCount++;
        this.logger.error(`Abonelik tarihi ilerletme hatası (subId=${sub.id}): ${err}`);
      }
    }
    this.logger.log(`${count} adet gecikmiş aktif abonelik ilerletildi, ${errorCount} hata alındı`);

    // 2. Deneme süresi (trial) biten abonelikleri trial -> active duruma geçir, geçmişe kaydet ve fatura tarihini hesapla
    const expiredTrials = await this.prisma.subscription.findMany({
      where: {
        status: 'trial',
        deletedAt: null,
        OR: [
          { trialEndDate: { lt: today } },
          { nextBillingDate: { lt: today } },
        ],
      },
    });

    let trialCount = 0;
    let trialErrorCount = 0;
    for (const sub of expiredTrials) {
      try {
        const nextDate = nextBillingDateOnOrAfter(
          sub.startDate,
          sub.billingCycle,
          sub.customCycleDays,
          today,
        );
        await this.prisma.$transaction([
          this.prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'active',
              nextBillingDate: nextDate,
            },
          }),
          this.prisma.subscriptionHistory.create({
            data: {
              subscriptionId: sub.id,
              changedField: 'status',
              oldValue: 'trial',
              newValue: 'active',
            },
          }),
        ]);
        trialCount++;
      } catch (err) {
        trialErrorCount++;
        this.logger.error(`Deneme süresi biten abonelik güncelleme hatası (subId=${sub.id}): ${err}`);
      }
    }
    this.logger.log(`${trialCount} adet deneme süresi biten abonelik active duruma geçirildi, ${trialErrorCount} hata alındı`);
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { differenceInCalendarDays } from 'date-fns';
import { SubscriptionsService } from '../modules/subscriptions/subscriptions.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { nextBillingDateOnOrAfter } from '../modules/subscriptions/billing-cycle.util';
import { startOfUtcDay } from '../common/date.util';

export interface RenewalReminderJobData {
  subscriptionId: string;
  userId: string;
  daysUntil: number;
}

const REMINDER_HORIZON_DAYS = 30;

@Injectable()
export class ReminderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    @InjectQueue('reminders') private readonly queue: Queue<any>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'scan-renewals-scheduler',
      { pattern: '0 7 * * *', tz: 'UTC' },
      { name: 'scan-renewals' },
    );
    await this.queue.upsertJobScheduler(
      'advance-billing-scheduler',
      { pattern: '0 0 * * *', tz: 'UTC' },
      { name: 'advance-billing' },
    );
    await this.queue.upsertJobScheduler(
      'zombie-scan-scheduler',
      { pattern: '0 8 * * 1', tz: 'UTC' },
      { name: 'zombie-scan' },
    );
    this.logger.log('BullMQ Job Schedulers başarıyla kaydedildi');
  }

  async scheduleUpcomingReminders() {
    const candidates = await this.subscriptionsService.findRenewingWithin(REMINDER_HORIZON_DAYS);
    this.logger.log(`${candidates.length} abonelik yenileme penceresinde tarandı`);

    const todayUtc = startOfUtcDay();
    let queued = 0;
    for (const sub of candidates) {
      try {
        const daysUntil = differenceInCalendarDays(sub.nextBillingDate, todayUtc);
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

  async sendReminder(data: RenewalReminderJobData) {
    const { subscriptionId, userId, daysUntil } = data;

    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { serviceProvider: true, user: { include: { notificationPreference: true } } },
    });
    if (!sub || sub.deletedAt) {
      this.logger.warn(`Abonelik bulunamadı/silinmiş, iş atlanıyor: ${subscriptionId}`);
      return;
    }

    const serviceName = sub.serviceProvider?.name ?? sub.customName ?? 'Aboneliğiniz';
    const channels = sub.user.notificationPreference?.channels ?? ['push'];

    await this.notifications.send({
      userId,
      channels,
      type: 'renewal_reminder',
      subscriptionId,
      payload: { serviceName, price: sub.price.toString(), currency: sub.currency, daysUntil },
    });

    this.logger.log(`Hatırlatıcı gönderildi: kullanıcı=${userId} abonelik=${subscriptionId}`);
  }

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

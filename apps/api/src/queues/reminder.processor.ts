import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RenewalReminderJobData } from './reminder-scheduler.service';

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<RenewalReminderJobData>) {
    const { subscriptionId, userId, daysUntil } = job.data;

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
}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionsModule } from '../modules/subscriptions/subscriptions.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderProcessor } from './reminder.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'reminders',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: false, // hata ayıklama için sakla, ayrı bir temizleme job'ı ile süpürülür
      },
    }),
    SubscriptionsModule,
    NotificationsModule,
  ],
  providers: [ReminderSchedulerService, ReminderProcessor],
})
export class ReminderQueueModule {}

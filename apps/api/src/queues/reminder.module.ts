import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionsModule } from '../modules/subscriptions/subscriptions.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderProcessor } from './reminder.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'reminders',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    }),
    SubscriptionsModule,
    NotificationsModule,
    AnalyticsModule,
  ],
  providers: [ReminderSchedulerService, ReminderProcessor],
})
export class ReminderQueueModule {}

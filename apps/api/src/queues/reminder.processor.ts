import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ZombieDetectorService } from '../modules/analytics/zombie-detector.service';

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly reminderScheduler: ReminderSchedulerService,
    private readonly zombieDetector: ZombieDetectorService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    if (job.name === 'scan-renewals') {
      await this.reminderScheduler.scheduleUpcomingReminders();
    } else if (job.name === 'advance-billing') {
      await this.reminderScheduler.advanceOverdueBillingDates();
    } else if (job.name === 'zombie-scan') {
      await this.zombieDetector.scanAllAndNotify();
    } else if (job.name === 'send-renewal-reminder') {
      await this.reminderScheduler.sendReminder(job.data);
    } else {
      this.logger.warn(`Bilinmeyen job ismi: ${job.name}`);
    }
  }
}

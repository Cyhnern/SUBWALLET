import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ZombieDetectorService } from './zombie-detector.service';

@Injectable()
export class ZombieScanSchedulerService {
  private readonly logger = new Logger(ZombieScanSchedulerService.name);

  constructor(private readonly zombieDetector: ZombieDetectorService) {}

  // Her Pazartesi UTC 08:00'de tüm aktif abonelikleri tarar.
  @Cron(CronExpression.EVERY_WEEK)
  async runWeeklyScan() {
    this.logger.log('Haftalık zombi abonelik taraması başlıyor');
    const result = await this.zombieDetector.scanAllAndNotify();
    this.logger.log(`Tarama tamamlandı: ${JSON.stringify(result)}`);
  }
}

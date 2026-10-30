import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ZombieDetectorService } from './zombie-detector.service';
import { ExchangeRatesService } from './exchange-rates.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    ZombieDetectorService,
    ExchangeRatesService,
  ],
  exports: [AnalyticsService, ZombieDetectorService, ExchangeRatesService],
})
export class AnalyticsModule {}

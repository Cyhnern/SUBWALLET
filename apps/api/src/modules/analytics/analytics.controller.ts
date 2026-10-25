import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { ZombieDetectorService } from './zombie-detector.service';
import { ExchangeRatesService } from './exchange-rates.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly zombieDetector: ZombieDetectorService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  @Get('burn-rate')
  burnRate(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.calculateBurnRate(user.id);
  }

  @Get('spending-by-category')
  spendingByCategory(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.spendingByCategory(user.id);
  }

  @Get('upcoming-renewals')
  upcomingRenewals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.analytics.upcomingRenewals(user.id, days);
  }

  @Get('zombie-subscriptions')
  zombieSubscriptions(@CurrentUser() user: AuthenticatedUser) {
    return this.zombieDetector.scanForUser(user.id);
  }

  @Get('exchange-rates')
  exchangeRatesMap(@Query('base') baseCurrency?: string) {
    const base = baseCurrency || 'TRY';
    return {
      baseCurrency: base,
      rates: this.exchangeRates.getRatesMap(base),
      status: this.exchangeRates.getStatus(),
    };
  }

  @Get('export/csv')
  async exportCsv(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const csvData = await this.analytics.generateCsvReport(user.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="subwallet_report_${Date.now()}.csv"`);
    return res.status(200).send('\uFEFF' + csvData);
  }
}

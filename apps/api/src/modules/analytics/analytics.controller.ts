import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
    return this.exchangeRates.getRatesMap(baseCurrency || 'TRY');
  }
}

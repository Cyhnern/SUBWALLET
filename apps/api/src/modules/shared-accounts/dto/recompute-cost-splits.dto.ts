import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class RecomputeCostSplitsDto {
  @ApiProperty({ example: '2026-08-01', description: 'Hesaplanacak fatura döneminin başlangıç tarihi' })
  @IsDateString()
  billingPeriodStart: string;
}

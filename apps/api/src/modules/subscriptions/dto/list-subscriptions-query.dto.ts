import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsUUID, IsIn, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionStatus, PaymentMethod } from '@prisma/client';

export class ListSubscriptionsQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sharedAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['nextBillingDate', 'priceAsc', 'priceDesc', 'nameAsc', 'nameDesc'] })
  @IsOptional()
  @IsIn(['nextBillingDate', 'priceAsc', 'priceDesc', 'nameAsc', 'nameDesc'])
  sortBy?: 'nextBillingDate' | 'priceAsc' | 'priceDesc' | 'nameAsc' | 'nameDesc';

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

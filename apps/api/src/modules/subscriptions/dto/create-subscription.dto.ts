import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsIn,
  IsInt,
  IsDateString,
  Length,
  ValidateIf,
} from 'class-validator';
import { BillingCycle, PaymentMethod } from '@prisma/client';

export class CreateSubscriptionDto {
  @ApiPropertyOptional({ description: 'Katalogdaki servis sağlayıcı ID (Netflix, Spotify vb.)' })
  @IsOptional()
  @IsUUID()
  serviceProviderId?: string;

  @ApiPropertyOptional({ description: 'Katalogda yoksa serbest metin isim' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  customName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Ortak hesaba bağlıysa hesap ID; kişisel abonelikte boş bırakılır' })
  @IsOptional()
  @IsUUID()
  sharedAccountId?: string;

  @ApiProperty({ example: 15.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiProperty({ enum: BillingCycle })
  @IsIn(['weekly', 'monthly', 'quarterly', 'yearly', 'custom'])
  billingCycle: BillingCycle;

  @ApiPropertyOptional({ description: 'billingCycle=custom ise zorunlu' })
  @ValidateIf((o) => o.billingCycle === 'custom')
  @IsInt()
  @Min(1)
  customCycleDays?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsIn(['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'crypto', 'other'])
  paymentMethod?: PaymentMethod;

  @ApiProperty({ example: '2026-07-22' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-08-22' })
  @IsOptional()
  @IsDateString()
  trialEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Fatura veya makbuz görseli URL / data URI' })
  @IsOptional()
  @IsString()
  invoiceUrl?: string;
}

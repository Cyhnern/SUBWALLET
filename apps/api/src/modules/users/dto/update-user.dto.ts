import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength, IsUrl, IsIn, IsTimeZone } from 'class-validator';
import { Transform } from 'class-transformer';
import { SUPPORTED_CURRENCIES, toUpperTrim } from '../../../common/currency';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ayşe Yılmaz' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'EUR', enum: SUPPORTED_CURRENCIES })
  @IsOptional()
  @Transform(toUpperTrim)
  @IsIn(SUPPORTED_CURRENCIES, { message: `Temel para birimi şunlardan biri olmalıdır: ${SUPPORTED_CURRENCIES.join(', ')}` })
  baseCurrency?: string;

  @ApiPropertyOptional({ example: 'Europe/Istanbul' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Expo push token — mobil uygulama açılışında otomatik gönderilir' })
  @IsOptional()
  @IsString()
  pushToken?: string;
}

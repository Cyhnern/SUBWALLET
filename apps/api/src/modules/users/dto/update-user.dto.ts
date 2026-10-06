import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength, IsUrl, Length, IsTimeZone } from 'class-validator';

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

  @ApiPropertyOptional({ example: 'EUR', description: 'ISO 4217 para birimi kodu' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
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

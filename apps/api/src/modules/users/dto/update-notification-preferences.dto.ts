import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsArray, IsIn, IsInt, Min, Max, IsBoolean, ArrayMaxSize, ArrayUnique } from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ enum: ['push', 'email', 'sms'], isArray: true, example: ['push', 'email'] })
  @IsOptional()
  @IsArray()
  @IsIn(['push', 'email', 'sms'], { each: true })
  channels?: NotificationChannel[];

  @ApiPropertyOptional({ example: [7, 3, 1], description: 'Yenilemeden kaç gün önce hatırlatılacağı' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(30, { each: true })
  daysBeforeRenewal?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  zombieAlertsEnabled?: boolean;
}

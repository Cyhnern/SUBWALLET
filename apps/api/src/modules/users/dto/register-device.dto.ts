import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Expo push token' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ enum: ['ios', 'android', 'web', 'unknown'], example: 'ios' })
  @IsOptional()
  @IsIn(['ios', 'android', 'web', 'unknown'])
  platform?: string;
}

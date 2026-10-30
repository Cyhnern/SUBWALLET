import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyEmailQueryDto {
  @ApiProperty({ description: '64 karakterlik hex doğrulama token\'ı' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Geçersiz doğrulama token biçimi' })
  token: string;
}

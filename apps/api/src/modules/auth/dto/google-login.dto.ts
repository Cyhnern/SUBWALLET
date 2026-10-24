import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google Sign-In sonucundaki idToken' })
  @IsString()
  idToken: string;
}

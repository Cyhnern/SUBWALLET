import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AppleLoginDto {
  @ApiProperty({ description: 'Expo AppleAuthentication.signInAsync() sonucundaki identityToken' })
  @IsString()
  identityToken: string;
}

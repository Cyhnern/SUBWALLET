import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmail } from '../../../common/transformers';

export class LoginDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;
}

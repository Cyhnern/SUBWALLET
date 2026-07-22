import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;
}

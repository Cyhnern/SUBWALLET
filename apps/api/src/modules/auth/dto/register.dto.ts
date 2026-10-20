import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 4 })
  @IsString()
  @MinLength(4)
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: 'Ayşe Yılmaz' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;
}

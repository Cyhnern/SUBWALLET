import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, description: 'En az 8 karakter, 1 rakam ve 1 harf içermeli' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // argon2/bcrypt pratik üst sınırı
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Parola en az bir harf ve bir rakam içermelidir',
  })
  password: string;

  @ApiProperty({ example: 'Ayşe Yılmaz' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;
}

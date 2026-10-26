import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeactivateAccountDto {
  @ApiPropertyOptional({ description: 'Parola ile kayıtlı kullanıcılar için hesap silme onayı için parola' })
  @IsOptional()
  @IsString()
  password?: string;
}

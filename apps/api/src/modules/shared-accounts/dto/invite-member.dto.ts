import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsIn } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ example: 'arkadas@ornek.com', description: 'Davet edilecek kayıtlı kullanıcının e-postası' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ['admin', 'member'], default: 'member' })
  @IsOptional()
  @IsIn(['admin', 'member'])
  role?: 'admin' | 'member';
}

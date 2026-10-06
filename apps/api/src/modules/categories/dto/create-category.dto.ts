import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Fitness' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 'ti-barbell', description: 'Tabler ikon adı' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: '#7F77DD' })
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'colorHex geçerli bir hex renk kodu olmalı, ör. #7F77DD' })
  colorHex?: string;
}

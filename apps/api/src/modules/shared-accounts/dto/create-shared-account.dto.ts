import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateSharedAccountDto {
  @ApiProperty({ example: 'Aile Netflix Havuzu' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ExchangeCodeDto {
  @ApiProperty({ description: 'OAuth web redirect akışından alınan 60 saniyelik tek kullanımlık kod' })
  @IsString()
  code: string;
}

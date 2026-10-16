import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ServiceProvidersService } from './service-providers.service';

@ApiTags('service-providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('service-providers')
export class ServiceProvidersController {
  constructor(private readonly service: ServiceProvidersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}

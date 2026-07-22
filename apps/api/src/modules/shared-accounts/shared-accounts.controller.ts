import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SharedAccountRoleGuard } from '../../common/guards/shared-account-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SharedAccountsService } from './shared-accounts.service';
import { CreateSharedAccountDto } from './dto/create-shared-account.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { RecomputeCostSplitsDto } from './dto/recompute-cost-splits.dto';

@ApiTags('shared-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('shared-accounts')
export class SharedAccountsController {
  constructor(private readonly service: SharedAccountsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSharedAccountDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAllForUser(user.id);
  }

  // Aşağıdaki uç noktaların tümü SharedAccountRoleGuard'dan geçer: `:id` parametresi
  // üzerinden çağıranın üyeliği (ve gerekiyorsa rolü) doğrulanır.
  @Get(':id')
  @UseGuards(SharedAccountRoleGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOneOrFail(id);
  }

  @Post(':id/members')
  @Roles('owner', 'admin')
  @UseGuards(SharedAccountRoleGuard)
  inviteMember(@Param('id') id: string, @Body() dto: InviteMemberDto) {
    return this.service.inviteMember(id, dto);
  }

  @Delete(':id/members/:memberUserId')
  @Roles('owner', 'admin')
  @UseGuards(SharedAccountRoleGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Param('id') id: string, @Param('memberUserId') memberUserId: string) {
    return this.service.removeMember(id, memberUserId);
  }

  @Post(':id/cost-splits/recompute')
  @Roles('owner', 'admin')
  @UseGuards(SharedAccountRoleGuard)
  recomputeCostSplits(@Param('id') id: string, @Body() dto: RecomputeCostSplitsDto) {
    return this.service.recomputeCostSplits(id, new Date(dto.billingPeriodStart));
  }

  @Get(':id/cost-splits')
  @UseGuards(SharedAccountRoleGuard)
  listCostSplits(@Param('id') id: string, @Query('billingPeriodStart') billingPeriodStart?: string) {
    return this.service.listCostSplits(id, billingPeriodStart ? new Date(billingPeriodStart) : undefined);
  }

  @Post(':id/cost-splits/:splitId/settle')
  @UseGuards(SharedAccountRoleGuard) // herhangi bir üye kendi payını ödendi işaretleyebilir
  settleCostSplit(
    @Param('splitId') splitId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.settleCostSplit(splitId, user.id);
  }
}

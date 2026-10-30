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
  Req,
  ParseUUIDPipe,
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

  @Post('invites/accept')
  acceptInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Body('token') token: string,
  ) {
    return this.service.acceptInvite(token, user.id, user.email);
  }

  @Get(':id')
  @UseGuards(SharedAccountRoleGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOneOrFail(id);
  }

  @Post(':id/members')
  @Roles('owner', 'admin')
  @UseGuards(SharedAccountRoleGuard)
  inviteMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteMemberDto) {
    return this.service.inviteMember(id, dto);
  }

  // NOT: 'members/me' statik rotası, ':memberUserId' parametreli rotasından ÖNCE tanımlanmalı
  @Delete(':id/members/me')
  @UseGuards(SharedAccountRoleGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  leaveAccount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.leaveAccount(id, user.id);
  }

  @Delete(':id/members/:memberUserId')
  @Roles('owner', 'admin')
  @UseGuards(SharedAccountRoleGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberUserId', ParseUUIDPipe) memberUserId: string,
    @Req() req: any,
  ) {
    return this.service.removeMember(id, memberUserId, req.sharedAccountMembership);
  }

  @Post(':id/transfer-ownership')
  @Roles('owner')
  @UseGuards(SharedAccountRoleGuard)
  transferOwnership(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('newOwnerId', ParseUUIDPipe) newOwnerId: string,
  ) {
    return this.service.transferOwnership(id, user.id, newOwnerId);
  }

  @Post(':id/cost-splits/recompute')
  @Roles('owner', 'admin')
  @UseGuards(SharedAccountRoleGuard)
  recomputeCostSplits(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecomputeCostSplitsDto) {
    return this.service.recomputeCostSplits(id, new Date(dto.billingPeriodStart));
  }

  @Get(':id/cost-splits')
  @UseGuards(SharedAccountRoleGuard)
  listCostSplits(@Param('id', ParseUUIDPipe) id: string, @Query('billingPeriodStart') billingPeriodStart?: string) {
    return this.service.listCostSplits(id, billingPeriodStart ? new Date(billingPeriodStart) : undefined);
  }

  @Post(':id/cost-splits/:splitId/settle')
  @UseGuards(SharedAccountRoleGuard)
  settleCostSplit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('splitId', ParseUUIDPipe) splitId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.settleCostSplit(id, splitId, user.id);
  }
}

import { Module } from '@nestjs/common';
import { SharedAccountsController } from './shared-accounts.controller';
import { SharedAccountsService } from './shared-accounts.service';
import { SharedAccountRoleGuard } from '../../common/guards/shared-account-role.guard';

@Module({
  controllers: [SharedAccountsController],
  providers: [SharedAccountsService, SharedAccountRoleGuard],
  exports: [SharedAccountsService],
})
export class SharedAccountsModule {}

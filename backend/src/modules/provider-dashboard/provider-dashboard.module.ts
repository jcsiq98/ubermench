import { Module } from '@nestjs/common';
import { ProviderDashboardController } from './provider-dashboard.controller';
import { ProviderDashboardService } from './provider-dashboard.service';

@Module({
  controllers: [ProviderDashboardController],
  providers: [ProviderDashboardService],
  exports: [ProviderDashboardService],
})
export class ProviderDashboardModule {}

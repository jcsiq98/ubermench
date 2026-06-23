import { Module, Global } from '@nestjs/common';
import { FinancialRateLimitService } from './financial-rate-limit.service';

// Global so IncomeService / ExpenseService (themselves @Global) can inject
// the guard without each feature module re-importing it. Depends only on
// RedisService, which RedisModule already provides globally.
@Global()
@Module({
  providers: [FinancialRateLimitService],
  exports: [FinancialRateLimitService],
})
export class FinancialRateLimitModule {}

import { Module, Global } from '@nestjs/common';
import { IncomeService } from './income.service';

@Global()
@Module({
  providers: [IncomeService],
  exports: [IncomeService],
})
export class IncomeModule {}

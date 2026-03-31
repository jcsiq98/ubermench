import { Module, Global } from '@nestjs/common';
import { ExpenseService } from './expense.service';

@Global()
@Module({
  providers: [ExpenseService],
  exports: [ExpenseService],
})
export class ExpenseModule {}

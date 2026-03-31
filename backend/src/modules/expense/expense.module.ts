import { Module, Global } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { RecurringExpenseService } from './recurring-expense.service';

@Global()
@Module({
  providers: [ExpenseService, RecurringExpenseService],
  exports: [ExpenseService, RecurringExpenseService],
})
export class ExpenseModule {}

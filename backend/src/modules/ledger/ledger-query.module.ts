import { Global, Module } from '@nestjs/common';
import { LedgerQueryService } from './ledger-query.service';

@Global()
@Module({
  providers: [LedgerQueryService],
  exports: [LedgerQueryService],
})
export class LedgerQueryModule {}

import { Global, Module } from '@nestjs/common';
import { BusinessLoopService } from './business-loop.service';

@Global()
@Module({
  providers: [BusinessLoopService],
  exports: [BusinessLoopService],
})
export class BusinessLoopModule {}

import { Module, Global } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';

@Global()
@Module({
  providers: [AiService, AiContextService],
  exports: [AiService, AiContextService],
})
export class AiModule {}

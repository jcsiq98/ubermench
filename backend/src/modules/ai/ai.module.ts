import { Module, Global } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { ChalanSelfModelService } from './chalan-self-model.service';

@Global()
@Module({
  providers: [AiService, AiContextService, ChalanSelfModelService],
  exports: [AiService, AiContextService, ChalanSelfModelService],
})
export class AiModule {}

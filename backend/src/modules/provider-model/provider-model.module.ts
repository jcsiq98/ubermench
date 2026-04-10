import { Module, Global } from '@nestjs/common';
import { ProviderModelService } from './provider-model.service';

@Global()
@Module({
  providers: [ProviderModelService],
  exports: [ProviderModelService],
})
export class ProviderModelModule {}

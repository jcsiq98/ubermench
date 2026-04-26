import { Global, Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { TimezoneMigrationService } from './timezone-migration.service';

@Global()
@Module({
  providers: [WorkspaceService, TimezoneMigrationService],
  exports: [WorkspaceService, TimezoneMigrationService],
})
export class WorkspaceModule {}

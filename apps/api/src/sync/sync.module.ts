import { Module } from '@nestjs/common';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { JobsService } from '../jobs/jobs.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [SyncService, ConnectorRegistry, JobsService],
  exports: [SyncService],
})
export class SyncModule {}

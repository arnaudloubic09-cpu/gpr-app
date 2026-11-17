import { Module } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [SyncService, JobsService],
  exports: [SyncService, JobsService],
})
export class SyncModule {}

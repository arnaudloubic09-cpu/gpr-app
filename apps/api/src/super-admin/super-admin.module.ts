import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { SuperAdminController } from './super-admin.controller';

@Module({ imports: [SyncModule], controllers: [SuperAdminController] })
export class SuperAdminModule {}

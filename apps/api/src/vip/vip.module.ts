import { Global, Module } from '@nestjs/common';
import { AdminVipController, MeVipController } from './vip.controller';
import { VipService } from './vip.service';

@Global()
@Module({
  controllers: [MeVipController, AdminVipController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}

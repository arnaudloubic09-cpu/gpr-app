import { Global, Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Global()
@Module({
  controllers: [RewardsController],
  providers: [RewardsService, CouponsService],
  exports: [CouponsService],
})
export class RewardsModule {}

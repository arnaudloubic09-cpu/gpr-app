import { Global, Module } from '@nestjs/common';
import { ClubAdminController } from './club-admin.controller';
import { ClubCouponsService } from './club-coupons.service';
import { PlayersService } from './players.service';
import { StatsService } from './stats.service';

@Global()
@Module({
  controllers: [ClubAdminController],
  providers: [ClubCouponsService, PlayersService, StatsService],
  exports: [PlayersService, StatsService],
})
export class ClubAdminModule {}

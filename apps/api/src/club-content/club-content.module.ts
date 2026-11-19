import { Module } from '@nestjs/common';
import {
  ClubContentAdminController,
  LocalPartnerLogoController,
  MeClubContentController,
} from './club-content.controller';
import { ClubContentService } from './club-content.service';

@Module({
  controllers: [ClubContentAdminController, MeClubContentController, LocalPartnerLogoController],
  providers: [ClubContentService],
})
export class ClubContentModule {}

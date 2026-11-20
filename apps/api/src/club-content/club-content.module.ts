import { Global, Module } from '@nestjs/common';
import {
  AdminLocalPartnersController,
  ClubContentAdminController,
  LocalPartnerLogoController,
  MeClubContentController,
  PartnerPortalController,
} from './club-content.controller';
import { ClubContentService } from './club-content.service';
import { PartnerPortalService } from './partner-portal.service';

@Global()
@Module({
  controllers: [
    ClubContentAdminController,
    MeClubContentController,
    LocalPartnerLogoController,
    PartnerPortalController,
    AdminLocalPartnersController,
  ],
  providers: [ClubContentService, PartnerPortalService],
  exports: [PartnerPortalService],
})
export class ClubContentModule {}

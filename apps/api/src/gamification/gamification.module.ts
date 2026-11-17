import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import {
  ClubChallengesController,
  ClubPerksController,
  GamificationReferenceController,
  NetworkGamificationController,
} from './admin-gamification.controller';
import { PerksService } from './perks.service';
import { ChallengesService } from './challenges.service';
import { GamificationService } from './gamification.service';
import { GdprService } from './gdpr.service';
import { LevelService } from './level.service';
import { MeGamificationController } from './me-gamification.controller';
import { NotificationsService } from './notifications.service';
import { ExpoPushSender, LogPushSender, PushSender } from './push-sender';

@Global()
@Module({
  controllers: [
    MeGamificationController,
    ClubChallengesController,
    ClubPerksController,
    NetworkGamificationController,
    GamificationReferenceController,
  ],
  providers: [
    {
      provide: PushSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('PUSH_PROVIDER', { infer: true }) === 'expo'
          ? new ExpoPushSender()
          : new LogPushSender(),
    },
    NotificationsService,
    LevelService,
    GamificationService,
    ChallengesService,
    GdprService,
    PerksService,
  ],
  exports: [NotificationsService, LevelService, GamificationService, GdprService],
})
export class GamificationModule {}

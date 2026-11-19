import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ClubAdminModule } from './club-admin/club-admin.module';
import { ClubContentModule } from './club-content/club-content.module';
import { ClubsModule } from './clubs/clubs.module';
import { CommonModule } from './common/common.module';
import { validateEnv } from './config/env';
import { GamificationModule } from './gamification/gamification.module';
import { HealthController } from './health/health.controller';
import { ConnectorsModule } from './connectors/connectors.module';
import { LedgerModule } from './ledger/ledger.module';
import { RewardsModule } from './rewards/rewards.module';
import { RulesModule } from './rules/rules.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { SyncModule } from './sync/sync.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { VipModule } from './vip/vip.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    RulesModule,
    LedgerModule,
    ConnectorsModule,
    RewardsModule,
    GamificationModule,
    VipModule,
    UsersModule,
    ClubsModule,
    ClubAdminModule,
    ClubContentModule,
    SyncModule,
    SuperAdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

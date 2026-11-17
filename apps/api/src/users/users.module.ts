import { Module } from '@nestjs/common';
import { AccountLinkService } from './account-link.service';
import { MeController } from './me.controller';

@Module({ controllers: [MeController], providers: [AccountLinkService] })
export class UsersModule {}

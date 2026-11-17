import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics/analytics.service';
import { AuditService } from './audit/audit.service';
import { CryptoService } from './crypto/crypto.service';
import { MailService, SmtpMailService } from './mail/mail.service';

@Global()
@Module({
  providers: [
    AuditService,
    AnalyticsService,
    CryptoService,
    { provide: MailService, useClass: SmtpMailService },
  ],
  exports: [AuditService, AnalyticsService, CryptoService, MailService],
})
export class CommonModule {}

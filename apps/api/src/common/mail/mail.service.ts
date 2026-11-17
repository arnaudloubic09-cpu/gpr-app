import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { Env } from '../../config/env';

export abstract class MailService {
  abstract sendOtp(to: string, code: string, ttlMinutes: number): Promise<void>;
  abstract sendAlert(to: string[], subject: string, text: string): Promise<void>;
}

@Injectable()
export class SmtpMailService extends MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
    });
    this.from = config.get('SMTP_FROM', { infer: true });
  }

  async sendOtp(to: string, code: string, ttlMinutes: number): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `${code} est votre code de connexion GPR`,
      text: `Votre code de connexion GPR : ${code}\n\nIl est valable ${ttlMinutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    });
  }

  async sendAlert(to: string[], subject: string, text: string): Promise<void> {
    if (!to.length) return;
    await this.transporter.sendMail({ from: this.from, to, subject: `[GPR] ${subject}`, text });
  }
}

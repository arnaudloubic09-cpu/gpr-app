import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AuthTokens,
  OtpRequest,
  otpRequestSchema,
  OtpVerify,
  otpVerifySchema,
  refreshSchema,
} from '@gpr/core';
import { AnalyticsService } from '../common/analytics/analytics.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Public } from './decorators';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestOtp(@Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest) {
    await this.otp.request(body.email, body.audience);
    return { message: 'Si ce compte peut se connecter, un code a été envoyé par email.' };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerify,
  ): Promise<AuthTokens> {
    const user = await this.otp.verify(body.email, body.code, body.audience);
    await this.analytics.track('auth.login', {
      userId: user.id,
      payload: { audience: body.audience },
    });
    return this.tokens.issue(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string },
  ): Promise<AuthTokens> {
    return this.tokens.rotate(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string }) {
    await this.tokens.revoke(body.refreshToken);
  }
}

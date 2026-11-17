import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { MeResponse } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() current: AuthUser): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: current.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, clubId: true },
    });
    if (!user) throw new NotFoundException();
    return user;
  }
}

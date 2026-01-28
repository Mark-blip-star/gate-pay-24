import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAccountDto } from './dto';

type JwtReq = Request & { user?: { userId: string } };

@Controller()
export class UserSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('account')
  async get(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) return { callbackUrl: null, redirectUrl: null };
    const account = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    return {
      callbackUrl: account?.callbackUrl ?? null,
      redirectUrl: account?.redirectUrl ?? null,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('account')
  async update(@Req() req: JwtReq, @Body() dto: UpdateAccountDto) {
    const userId = req.user?.userId;
    if (!userId) return { callbackUrl: null, redirectUrl: null };
    const account = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        callbackUrl: dto.callbackUrl ?? null,
        redirectUrl: dto.redirectUrl ?? null,
      },
      update: {
        ...(dto.callbackUrl !== undefined && {
          callbackUrl: dto.callbackUrl || null,
        }),
        ...(dto.redirectUrl !== undefined && {
          redirectUrl: dto.redirectUrl || null,
        }),
      },
    });
    return {
      callbackUrl: account.callbackUrl,
      redirectUrl: account.redirectUrl,
    };
  }
}

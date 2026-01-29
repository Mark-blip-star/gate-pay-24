import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { UsersStore } from '../store/users.store';

type JwtReq = Request & { user?: { userId: string } };

@Controller()
export class MeController {
  constructor(private readonly users: UsersStore) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) return null;
    const user = await this.users.findById(userId);
    if (!user) return null;
    return { id: user.id, email: user.email, publicKey: user.publicKey };
  }
}

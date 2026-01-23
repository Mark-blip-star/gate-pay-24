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
  me(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    const user = userId ? this.users.findById(userId) : null;
    if (!user) return null;
    return { id: user.id, email: user.email };
  }
}



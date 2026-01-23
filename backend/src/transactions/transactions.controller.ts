import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { TransactionsStore } from '../store/transactions.store';
import { WithdrawDto } from './dto';

type JwtReq = Request & { user?: { userId: string } };

@Controller()
export class TransactionsController {
  constructor(private readonly tx: TransactionsStore) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('transactions')
  list(@Req() req: JwtReq) {
    const userId = req.user?.userId!;
    const items = this.tx.listForUser(userId);
    const balance = this.tx.getBalance(userId);
    return { items, balance };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('withdraw')
  withdraw(@Req() req: JwtReq, @Body() dto: WithdrawDto) {
    const userId = req.user?.userId!;
    const balance = this.tx.getBalance(userId);
    if (dto.amount > balance) throw new BadRequestException('Insufficient balance');
    const transaction = this.tx.withdraw(userId, dto.amount);
    return { transaction, balance: this.tx.getBalance(userId) };
  }
}



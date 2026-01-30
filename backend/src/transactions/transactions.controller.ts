import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsStore } from '../store/transactions.store';
import { getRateToEur } from './currency.util';
import { WithdrawDto } from './dto';

type JwtReq = Request & { user?: { userId: string } };

@Controller()
export class TransactionsController {
  constructor(
    private readonly tx: TransactionsStore,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('transactions')
  async list(@Req() req: JwtReq) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const items = payments.map((p) => ({
      id: p.id,
      type: 'deposit' as const,
      amount: Number(p.amount),
      currency: (p.currency ?? 'USD').toUpperCase(),
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      paymentType: p.paymentType ?? undefined,
    }));
    const balance = payments
      .filter((p) => p.status === 'completed')
      .reduce(
        (sum, p) =>
          sum + Number(p.amount) * getRateToEur(p.currency ?? 'EUR'),
        0,
      );
    return { items, balance, currency: 'EUR' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('withdraw')
  withdraw(@Req() req: JwtReq, @Body() dto: WithdrawDto) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    const balance = this.tx.getBalance(userId);
    if (dto.amount > balance)
      throw new BadRequestException('Insufficient balance');
    const transaction = this.tx.withdraw(userId, dto.amount);
    return { transaction, balance: this.tx.getBalance(userId) };
  }
}

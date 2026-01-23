import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type TransactionRecord = {
  id: string;
  userId: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  currency: 'USD';
  status: 'completed';
  createdAt: string;
};

@Injectable()
export class TransactionsStore {
  private tx: TransactionRecord[] = [];

  seedForUser(userId: string) {
    const now = Date.now();
    const seeds: Array<{ type: 'deposit'; amount: number; offsetMs: number }> = [
      { type: 'deposit', amount: 120, offsetMs: 1000 * 60 * 60 * 3 },
      { type: 'deposit', amount: 45, offsetMs: 1000 * 60 * 60 * 24 },
      { type: 'deposit', amount: 300, offsetMs: 1000 * 60 * 60 * 24 * 7 },
    ];
    for (const s of seeds) {
      this.tx.push({
        id: randomUUID(),
        userId,
        type: s.type,
        amount: s.amount,
        currency: 'USD',
        status: 'completed',
        createdAt: new Date(now - s.offsetMs).toISOString(),
      });
    }
  }

  listForUser(userId: string) {
    return this.tx
      .filter((t) => t.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  getBalance(userId: string) {
    return this.tx
      .filter((t) => t.userId === userId)
      .reduce((acc, t) => acc + (t.type === 'deposit' ? t.amount : -t.amount), 0);
  }

  withdraw(userId: string, amount: number) {
    const tr: TransactionRecord = {
      id: randomUUID(),
      userId,
      type: 'withdraw',
      amount,
      currency: 'USD',
      status: 'completed',
      createdAt: new Date().toISOString(),
    };
    this.tx.push(tr);
    return tr;
  }
}



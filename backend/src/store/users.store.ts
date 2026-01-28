import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  publicKey?: string;
};

@Injectable()
export class UsersStore {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    return user;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    return user;
  }

  async create(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserRecord> {
    const normalized = input.email.trim().toLowerCase();
    const publicKey = randomUUID();
    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        passwordHash: input.passwordHash,
        publicKey,
      },
    });
    return user;
  }
}

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
};

@Injectable()
export class UsersStore {
  private users: UserRecord[] = [];

  findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }

  findByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === normalized) ?? null;
  }

  create(input: { email: string; passwordHash: string }) {
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
    };
    this.users.push(user);
    return user;
  }
}



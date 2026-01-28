import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TransactionsStore } from '../store/transactions.store';
import { UsersStore } from '../store/users.store';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersStore,
    private readonly tx: TransactionsStore,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create({ email, passwordHash });
    this.tx.seedForUser(user.id);

    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: { id: user.id, email: user.email } };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user: { id: user.id, email: user.email } };
  }
}

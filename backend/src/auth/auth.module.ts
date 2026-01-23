import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TransactionsStore } from '../store/transactions.store';
import { UsersStore } from '../store/users.store';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_secret_change_me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UsersStore, TransactionsStore, JwtStrategy],
  exports: [AuthService, UsersStore, TransactionsStore],
})
export class AuthModule {}



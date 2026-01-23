import { Body, Controller, Post } from '@nestjs/common';
import { EmailPasswordDto } from './dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: EmailPasswordDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: EmailPasswordDto) {
    return this.auth.login(dto.email, dto.password);
  }
}



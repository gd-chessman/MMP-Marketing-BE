import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() loginDto: { email: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(loginDto.email, loginDto.password, response);
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response) {
    return this.authService.logout(response);
  }
}

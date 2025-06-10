import { Controller, Post, Body, Res, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthUserWalletGuard } from './jwt-auth-user-wallet.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('login-telegram')
    async login(
        @Body() body: { id: string; code: string },
        @Res({ passthrough: true }) res: Response,
    ) {
        const { id, code } = body;
        return this.authService.login(id, code, res);
    }

    @Post('logout')
    @UseGuards(JwtAuthUserWalletGuard)
    async logout(@Res({ passthrough: true }) response: Response) {
      return this.authService.logout(response);
    }
}

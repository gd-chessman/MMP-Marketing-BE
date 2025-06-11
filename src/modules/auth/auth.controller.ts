import { Controller, Post, Body, Res, HttpStatus, HttpCode, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleLoginDto, LoginResponse } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('login-telegram')
    async loginWithTelegram(
        @Body() body: { id: string; code: string },
        @Res({ passthrough: true }) res: Response,
    ) {
        const { id, code } = body;
        return this.authService.handleTelegramLogin(id, code, res);
    }

    @Post('logout')
    async logout(@Res({ passthrough: true }) response: Response) {
      return this.authService.logout(response);
    }

    @Post('login-email')
    async loginWithGoogle(@Body() googleData: GoogleLoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
        return await this.authService.handleGoogleLogin(googleData, res);
    }
}

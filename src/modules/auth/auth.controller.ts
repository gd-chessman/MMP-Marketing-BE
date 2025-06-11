import { Controller, Post, Body, Res, HttpStatus, HttpCode, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AddGoogleAuthResponseDto, GoogleLoginDto, LoginResponse, VerifyGoogleAuthDto } from './dto/auth.dto';
import { JwtGuestGuard } from './jwt-guest.guard';

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

    @Post('add-gg-auth')
    @UseGuards(JwtGuestGuard)
    async addGoogleAuth(@Request() req): Promise<AddGoogleAuthResponseDto> {
        return await this.authService.handleAddGoogleAuth(req.user.user.id);
    }

    @Post('verify-gg-auth')
    @UseGuards(JwtGuestGuard)
    async verifyGoogleAuth(@Request() req, @Body() dto: VerifyGoogleAuthDto): Promise<LoginResponse> {
        return await this.authService.handleVerifyGoogleAuth(req.user.user.id, dto.code);
    }
}

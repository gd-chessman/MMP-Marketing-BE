import { Controller, Post, Body, Res, HttpStatus, HttpCode, UseGuards, Request, Delete, Get } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AddGoogleAuthResponseDto, GoogleLoginDto, LoginResponse, VerifyGoogleAuthDto, AddEmailAuthDto, SendEmailVerificationDto, VerifyEmailCodeDto, PhantomLoginDto } from './dto/auth.dto';
import { JwtGuestGuard } from './jwt-guest.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('login-telegram')
    async loginWithTelegram(
        @Body() body: { id: string; code: string , ref_code?: any},
        @Res({ passthrough: true }) res: Response,
    ) {
        const { id, code, ref_code } = body;
        return this.authService.handleTelegramLogin(id, code, res, ref_code);
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

    @Delete('remove-gg-auth')
    @UseGuards(JwtGuestGuard)
    async removeGoogleAuth(@Request() req): Promise<LoginResponse> {
        return await this.authService.handleRemoveGoogleAuth(req.user.user.id);
    }

    @Post('add-link-email')
    @UseGuards(JwtGuestGuard)
    async addLinkEmailAuth(@Request() req, @Body() dto: AddEmailAuthDto): Promise<LoginResponse> {
        return await this.authService.handleAddLinkEmailAuth(req.user.user.id, dto.code);
    }

    @Get('send-verify-email')
    @UseGuards(JwtGuestGuard)
    async sendEmailVerification(@Request() req): Promise<LoginResponse> {
        return await this.authService.handleSendTeleVerification(req.user.user.id);
    }

    @Post('verify-code-email')
    @UseGuards(JwtGuestGuard)
    async verifyEmailCode(@Request() req, @Body() dto: VerifyEmailCodeDto): Promise<LoginResponse> {
        return await this.authService.handleVerifyTeleCode(req.user.user.id, dto.code);
    }

    @Post('login-phantom')
    async loginWithPhantom(@Body() body: PhantomLoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
        return await this.authService.handlePhantomLogin(body, res);
    }
}

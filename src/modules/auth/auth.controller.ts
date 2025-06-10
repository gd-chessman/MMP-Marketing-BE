import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';

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
}

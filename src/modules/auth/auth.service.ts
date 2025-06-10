import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramCodes } from '../telegram_codes/telegram-codes.entity';
import { UserWallet } from '../user-wallets/user-wallet.entity';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        @InjectRepository(TelegramCodes)
        private telegramCodesRepository: Repository<TelegramCodes>,
        @InjectRepository(UserWallet)
        private userWalletRepository: Repository<UserWallet>,
    ) {}

    async login(telegramId: string, code: string, res: Response) {
        if (!telegramId || !code) {
            throw new BadRequestException('Telegram ID and code are required');
        }

        // Validate telegram code
        const telegramCode = await this.telegramCodesRepository.findOne({
            where: {
                code,
                telegram_id: telegramId,
                is_used: false
            }
        });

        if (!telegramCode) {
            throw new BadRequestException('Invalid code');
        }

        // Check expiration
        if (new Date() > telegramCode.expires_at) {
            throw new BadRequestException('Code has expired');
        }

        // Mark code as used
        telegramCode.is_used = true;
        await this.telegramCodesRepository.save(telegramCode);

        // Check if user wallet exists
        let userWallet = await this.userWalletRepository.findOne({
            where: { telegram_id: telegramId }
        });

        // Create new user wallet if not exists
        if (!userWallet) {
            userWallet = this.userWalletRepository.create({
                telegram_id: telegramId,
                email: '', // Temporary email
                sol_address: '', // Will be updated later
                private_key: '', // Will be updated later
                isActiveMail: false
            });
            await this.userWalletRepository.save(userWallet);
        }

        const payload = { 
            uw_id: userWallet.id,
        };
        
        const accessToken = this.jwtService.sign(payload);

        // Set HTTP-only cookie
        res.cookie('access_token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: parseInt(process.env.COOKIE_EXPIRES_IN) * 1000,
        });

        return {
            success: true,
            message: 'Login successful',
        };
    }

    async validateToken(token: string) {
        try {
            const payload = await this.jwtService.verify(token);
            return payload;
        } catch (error) {
            return null;
        }
    }

    async logout(response: Response) {
        response.clearCookie('access_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        return {
            success: true,
            message: 'Logout successful'
        };
    }
}

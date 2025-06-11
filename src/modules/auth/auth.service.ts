import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramCode } from '../telegram_codes/telegram-code.entity';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        @InjectRepository(TelegramCode)
        private telegramCodesRepository: Repository<TelegramCode>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Wallet)
        private walletRepository: Repository<Wallet>,
    ) {}

    private generateSolanaWallet() {
        const keypair = Keypair.generate();
        return {
            publicKey: keypair.publicKey.toBase58(),
            privateKey: bs58.encode(keypair.secretKey)
        };
    }

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

        // Check if user exists
        let user = await this.userRepository.findOne({
            where: { telegram_id: telegramId }
        });

        // Create new user if not exists
        if (!user) {
            user = this.userRepository.create({
                telegram_id: telegramId,
            });
            await this.userRepository.save(user);
        }

        // Check if wallet exists for user
        let wallet = await this.walletRepository.findOne({
            where: { user_id: user.id }
        });

        // Create new wallet if not exists
        if (!wallet) {
            const solanaWallet = this.generateSolanaWallet();
            wallet = this.walletRepository.create({
                user_id: user.id,
                sol_address: solanaWallet.publicKey,
                private_key: solanaWallet.privateKey,
            });
            await this.walletRepository.save(wallet);
        }

        const payload = { 
            user_id: user.id,
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

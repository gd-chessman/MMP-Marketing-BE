import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramCode } from '../telegram_codes/telegram-code.entity';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { GoogleLoginDto, LoginResponse, AddGoogleAuthResponseDto } from './dto/auth.dto';
import { GoogleAuthService } from './google-auth.service';
import * as speakeasy from 'speakeasy';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private jwtService: JwtService,
        private googleAuthService: GoogleAuthService,
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

    async handleTelegramLogin(telegramId: string, code: string, res: Response) {
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
            wallet_id: wallet.id,
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

    // async validateToken(token: string) {
    //     try {
    //         const payload = await this.jwtService.verify(token);
    //         return payload;
    //     } catch (error) {
    //         return null;
    //     }
    // }

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

    async handleGoogleLogin(loginData: GoogleLoginDto, res: Response): Promise<LoginResponse> {
        try {
            // 1. Exchange code for tokens
            const tokens = await this.googleAuthService.exchangeCodeForToken(loginData.code, 'login-email');

            // 2. Verify ID token and get user info
            const userInfo = await this.googleAuthService.verifyIdToken(tokens.id_token);

            // 3. Find or create user
            let user = await this.userRepository.findOne({
                where: { email: userInfo.email }
            });

            let isNewUser = false;
            if (!user) {
                // Create new user
                user = this.userRepository.create({
                    email: userInfo.email,
                    full_name: userInfo.name,
                    is_verified_email: userInfo.email_verified
                });
                await this.userRepository.save(user);
                isNewUser = true;

                // Create new wallet for user
                const solanaWallet = this.generateSolanaWallet();
                const wallet = this.walletRepository.create({
                    user_id: user.id,
                    sol_address: solanaWallet.publicKey,
                    private_key: solanaWallet.privateKey,
                });
                await this.walletRepository.save(wallet);
            }

            // Get wallet for existing user
            const wallet = await this.walletRepository.findOne({
                where: { user_id: user.id }
            });

            // 4. Generate JWT token
            const payload = { 
                user_id: user.id,
                wallet_id: wallet.id,
            };
            
            const accessToken = this.jwtService.sign(payload);

            res.cookie('access_token', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: parseInt(process.env.COOKIE_EXPIRES_IN) * 1000,
            });

            return {
                status: true,
                message: isNewUser ? 'Account created and login successful' : 'Login successful',
            };

        } catch (error) {
            throw new BadRequestException(error.message || 'Login failed');
        }
    }

    async handleAddGoogleAuth(userId: number): Promise<AddGoogleAuthResponseDto> {
        try {
            // Find user
            const user = await this.userRepository.findOne({
                where: { id: userId }
            });

            if (!user) {
                throw new BadRequestException('User not found');
            }

            // Check if Google Auth is already active
            if (user.is_verified_gg_auth) {
                throw new BadRequestException('Google Authenticator is already active for this user');
            }

            // Generate secret using speakeasy
            const secret = speakeasy.generateSecret({
                length: 20,
                name: `Memepump:${user.id}`,
                issuer: 'Memepump'
            });

            // Save new secret to database
            user.gg_auth = secret.base32;
            user.is_verified_gg_auth = false;
            await this.userRepository.save(user);

            return {
                status: true,
                message: 'Google Authenticator setup successfully',
                qr_code_url: secret.otpauth_url,
                secret_key: secret.base32
            };
        } catch (error) {
            throw new BadRequestException(error.message || 'Internal server error');
        }
    }

    async handleVerifyGoogleAuth(userId: number, code: string): Promise<LoginResponse> {
        try {
            // Find user
            const user = await this.userRepository.findOne({
                where: { id: userId }
            });

            if (!user) {
                throw new BadRequestException('User not found');
            }

            if (!user.gg_auth) {
                throw new BadRequestException('Google Authenticator is not set up for this user');
            }

            // Verify the token
            const verified = speakeasy.totp.verify({
                secret: user.gg_auth,
                encoding: 'base32',
                token: code,
                window: 1 // Allow 30 seconds clock skew
            });

            if (!verified) {
                throw new BadRequestException('Invalid verification code');
            }

            // Mark Google Auth as verified
            user.is_verified_gg_auth = true;
            await this.userRepository.save(user);

            return {
                status: true,
                message: 'Google Authenticator verified successfully'
            };
        } catch (error) {
            throw new BadRequestException(error.message || 'Internal server error');
        }
    }

    async handleRemoveGoogleAuth(userId: number): Promise<LoginResponse> {
        try {
            // Find user
            const user = await this.userRepository.findOne({
                where: { id: userId }
            });

            if (!user) {
                throw new BadRequestException('User not found');
            }

            if (!user.gg_auth) {
                throw new BadRequestException('Google Authenticator is not set up for this user');
            }

            // Remove Google Auth
            user.gg_auth = null;
            user.is_verified_gg_auth = false;
            await this.userRepository.save(user);

            return {
                status: true,
                message: 'Google Authenticator removed successfully'
            };
        } catch (error) {
            throw new BadRequestException(error.message || 'Internal server error');
        }
    }

    async handleAddLinkEmailAuth(userId: number, code: string): Promise<LoginResponse> {
        try {
            // Find user
            const user = await this.userRepository.findOne({
                where: { id: userId }
            });

            if (!user) {
                throw new BadRequestException('User not found');
            }

            // Check if user has Telegram ID
            if (!user.telegram_id) {
                throw new BadRequestException('User does not have a Telegram account');
            }

            // Check if user already has email
            if (user.email) {
                throw new BadRequestException('User already has an email account');
            }

            // Exchange code for tokens
            const tokens = await this.googleAuthService.exchangeCodeForToken(code, 'security');

            // Verify ID token and get user info
            const userInfo = await this.googleAuthService.verifyIdToken(tokens.id_token);

            // Check if email is already used by another account
            const existingUser = await this.userRepository.findOne({
                where: { email: userInfo.email }
            });

            if (existingUser) {
                throw new BadRequestException('Email is already associated with another account');
            }

            // Update user with email information
            user.email = userInfo.email;
            user.full_name = userInfo.name;
            user.is_verified_email = userInfo.email_verified;
            await this.userRepository.save(user);

            return {
                status: true,
                message: 'Email authentication added successfully'
            };
        } catch (error) {
            throw new BadRequestException(error.message || 'Failed to add email authentication');
        }
    }
}

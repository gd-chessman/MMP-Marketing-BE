import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VerifyCode } from '../verify-codes/verify-code.entity';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { GoogleLoginDto, LoginResponse, AddGoogleAuthResponseDto, PhantomLoginDto } from './dto/auth.dto';
import { GoogleAuthService } from './google-auth.service';
import * as speakeasy from 'speakeasy';
import { TelegramBotService } from '../../shared/telegram-bot/telegram-bot.service';
import * as nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private jwtService: JwtService,
        private googleAuthService: GoogleAuthService,
        private telegramBotService: TelegramBotService,
        @InjectRepository(VerifyCode)
        private verifyCodesRepository: Repository<VerifyCode>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Wallet)
        private walletRepository: Repository<Wallet>
    ) {}

    private generateSolanaWallet() {
        const keypair = Keypair.generate();
        return {
            publicKey: keypair.publicKey.toBase58(),
            privateKey: bs58.encode(keypair.secretKey)
        };
    }

    async handleTelegramLogin(telegramId: string, code: string, res: Response, ref_code?: any) {
        if (!telegramId || !code) {
            throw new BadRequestException('Telegram ID and code are required');
        }

        // Validate telegram code
        const telegramCode = await this.verifyCodesRepository.findOne({
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
        await this.verifyCodesRepository.save(telegramCode);

        // Check if user exists
        let user = await this.userRepository.findOne({
            where: { telegram_id: telegramId }
        });

        // Create new user if not exists
        if (!user) {
            try {
                user = this.userRepository.create({
                    telegram_id: telegramId,
                });
                await this.userRepository.save(user);
            } catch (error) {
                if (error.code === '23505') { // PostgreSQL unique violation error code
                    // If user was created by another request, try to fetch it again
                    user = await this.userRepository.findOne({
                        where: { telegram_id: telegramId }
                    });
                    if (!user) {
                        this.logger.error('User already exists');
                    }
                } else {
                    throw error;
                }
            }
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
                referred_by: ref_code,
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
            sameSite: 'none',
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
            sameSite: 'none'
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
                    referred_by: loginData.ref_code,
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
                sameSite: 'none',
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

            // Update user with email information without verification
            user.email = userInfo.email;
            user.full_name = userInfo.name;
            // Không cập nhật is_verified_email
            await this.userRepository.save(user);

            return {
                status: true,
                message: 'Email added successfully'
            };
        } catch (error) {
            throw new BadRequestException(error.message || 'Failed to add email');
        }
    }

    async handleSendTeleVerification(userId: number): Promise<LoginResponse> {
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

            // Check if user has email
            if (!user.email) {
                throw new BadRequestException('User does not have an email account');
            }

            // Check if email is already verified
            if (user.is_verified_email) {
                throw new BadRequestException('Email is already verified');
            }

            // Generate verification code (6 digits)
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            // Save verification code to database
            const telegramCode = this.verifyCodesRepository.create({
                telegram_id: user.telegram_id,
                code: verificationCode,
                is_used: false,
                expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
            });
            await this.verifyCodesRepository.save(telegramCode);

            // Send verification code via Telegram
            await this.telegramBotService.sendEmailVerificationCode(user.telegram_id, verificationCode);

            return {
                status: true,
                message: 'Verification code sent successfully'
            };
        } catch (error) {
            throw new BadRequestException(error.message || 'Failed to send verification code');
        }
    }

    async handleVerifyTeleCode(userId: number, code: string): Promise<LoginResponse> {
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

            // Check if email is already verified
            if (user.is_verified_email) {
                throw new BadRequestException('Email is already verified');
            }

            // Validate verification code
            const telegramCode = await this.verifyCodesRepository.findOne({
                where: {
                    code,
                    telegram_id: user.telegram_id,
                    is_used: false
                }
            });

            if (!telegramCode) {
                throw new BadRequestException('Invalid verification code');
            }

            // Check expiration
            if (new Date() > telegramCode.expires_at) {
                throw new BadRequestException('Verification code has expired');
            }

            // Mark code as used
            telegramCode.is_used = true;
            await this.verifyCodesRepository.save(telegramCode);

            // Update user's email verification status
            user.is_verified_email = true;
            await this.userRepository.save(user);

            return {
                status: true,
                message: 'Email verified successfully'
            };
        } catch (error) {
            throw new BadRequestException(error.message || 'Failed to verify email');
        }
    }

    async handlePhantomLogin(loginData: PhantomLoginDto, res: Response): Promise<LoginResponse> {
        const { signature, public_key, message } = loginData;
        if (!signature || !public_key || !message) {
            throw new BadRequestException('Missing signature, public_key, or message');
        }

        // Kiểm tra message có đúng định dạng và timestamp hợp lệ không
        const messageRegex = /^Login to MMP Platform - (\d+)$/;
        const match = message.match(messageRegex);
        if (!match) {
            throw new BadRequestException('Invalid message format');
        }
        const timestamp = parseInt(match[1], 10);
        const now = Date.now();
        const maxDelay = 2 * 60 * 1000; // 2 phút
        if (isNaN(timestamp) || Math.abs(now - timestamp) > maxDelay) {
            throw new BadRequestException('Message expired');
        }

        try {
            // 1. Xác thực chữ ký
            const isValid = nacl.sign.detached.verify(
                Buffer.from(message),
                Buffer.from(signature),
                bs58.decode(public_key)
            );
            if (!isValid) {
                throw new BadRequestException('Invalid signature');
            }

            const solAddress = public_key;
            // 2. Kiểm tra xem đã có wallet với sol_address này chưa
            let wallet = await this.walletRepository.findOne({
                where: { sol_address: solAddress }
            });

            if (!wallet) {
                // Nếu chưa có wallet, tạo user mới và gán vào wallet
                wallet = this.walletRepository.create({
                    user_id: null,
                    sol_address: solAddress,
                    private_key: null,
                });
                await this.walletRepository.save(wallet);
            }

            // 3. Tạo JWT chỉ với wallet_id
            const payload = {
                user_id: wallet.user_id,
                wallet_id: wallet.id,
            };
            const accessToken = this.jwtService.sign(payload);
            res.cookie('access_token', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: parseInt(process.env.COOKIE_EXPIRES_IN) * 1000,
            });
            return {
                status: true,
                message: 'Login successful',
            };
        } catch (e) {
            this.logger.error('Phantom login error:', e);
            throw new BadRequestException('Invalid signature format');
        }
    }
}

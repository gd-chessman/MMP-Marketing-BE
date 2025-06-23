import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerifyCodeService } from '../../modules/verify-codes/verify-code.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/user.entity';
import { Wallet } from '../../modules/wallets/wallet.entity';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';

@Injectable()
export class TelegramBotService implements OnModuleInit {
    private botToken: string;
    private workerUrl: string;
    private frontendUrl: string;
    private readonly logger = new Logger(TelegramBotService.name);
    private lastUpdateId: number = 0;
    private isPolling: boolean = false;

    constructor(
        private configService: ConfigService,
        private readonly verifyCodeService: VerifyCodeService,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Wallet)
        private walletRepository: Repository<Wallet>,
    ) {
        this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
        this.workerUrl = this.configService.get<string>('URL_WORKER', 'https://proxy.michosso2025.workers.dev');
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL_REDIRECT');

        if (!this.botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing in .env file');
        }
        if (!this.frontendUrl) {
            throw new Error('FRONTEND_URL_REDIRECT is missing in .env file');
        }
    }

    private generateSolanaWallet() {
        const keypair = Keypair.generate();
        return {
            publicKey: keypair.publicKey.toBase58(),
            privateKey: bs58.encode(keypair.secretKey)
        };
    }

    private async sendMessage(chatId: number, text: string, options?: any): Promise<any> {
        try {
            const url = `${this.workerUrl}/bot${this.botToken}/sendMessage`;
            const response = await axios.post(url, {
                chat_id: chatId,
                text: text,
                ...options
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Error sending message: ${error.message}`);
            throw error;
        }
    }

    private async getUpdates(): Promise<any[]> {
        try {
            const url = `${this.workerUrl}/bot${this.botToken}/getUpdates`;
            const response = await axios.get(url, {
                params: {
                    offset: this.lastUpdateId + 1,
                    timeout: 30
                }
            });
            return response.data.result || [];
        } catch (error) {
            this.logger.error(`Error getting updates: ${error.message}`);
            return [];
        }
    }

    private async handleUpdate(update: any): Promise<void> {
        if (!update.message) return;

        const message = update.message;
        const chatId = message.chat.id;
        const text = message.text;
        const telegramId = message.from?.id?.toString();

        if (!telegramId) {
            await this.sendMessage(chatId, '❌ Lỗi: Không thể xác định Telegram ID.');
            return;
        }

        if (text?.startsWith('/start')) {
            try {
                // Parse referral code from /start command
                const args = text.split(' ');
                const referralCode = args.length > 1 ? args[1] : null;

                // Validate referral code if provided
                let referrerWallet = null;
                console.log( 'referralCode', referralCode);
                if (referralCode && referralCode.length === 8) {
                    referrerWallet = await this.walletRepository.findOne({
                        where: { referral_code: referralCode }
                    });
                    
                    if (!referrerWallet) {
                        await this.sendMessage(chatId, '❌ Invalid referral code. Please check again.');
                        return;
                    }
                }

                // Check if user exists
                let user = await this.userRepository.findOne({
                    where: { telegram_id: telegramId }
                });

                let isNewUser = false;

                // Create new user if not exists
                if (!user) {
                    try {
                        user = this.userRepository.create({
                            telegram_id: telegramId,
                        });
                        await this.userRepository.save(user);
                        isNewUser = true;
                        this.logger.log(`Created new user with telegram_id: ${telegramId}`);
                    } catch (error) {
                        if (error.code === '23505') { // PostgreSQL unique violation error code
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
                    const walletData: Partial<Wallet> = {
                        user_id: user.id,
                        sol_address: solanaWallet.publicKey,
                        private_key: solanaWallet.privateKey,
                    };
                    
                    // Only set referred_by if referralCode is provided
                    if (referralCode && referralCode.length === 8) {
                        walletData.referred_by = referralCode;
                    }
                    
                    
                    wallet = this.walletRepository.create(walletData);
                    await this.walletRepository.save(wallet);
                    
                    if (referralCode) {
                        this.logger.log(`Created new wallet with referral code: ${referralCode} for user: ${telegramId}`);
                    } else {
                        this.logger.log(`Created new wallet without referral for user: ${telegramId}`);
                    }
                }

                // Tạo mã code mới cho user
                const code = await this.verifyCodeService.generateCode(telegramId);
                
                let message = `
⭐️ *Welcome to MemePump Marketing* 🤘

Please click the button below to login.
This link will expire in 10 minutes.`;

                // Add referral info if provided and user was newly created
                if (referralCode && referrerWallet && isNewUser) {
                    message += `\n\n🎁 *Referred by: ${referralCode}*`;
                }

                const keyboard = {
                    inline_keyboard: [
                        [{ text: '🌐 Login Website', url: `${this.frontendUrl}/tglogin?id=${telegramId}&code=${code}` }],
                    ],
                };

                await this.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                
            } catch (error) {
                this.logger.error(`Start command failed: ${error.message}`);
                await this.sendMessage(chatId, '❌ Có lỗi xảy ra. Vui lòng thử lại sau.');
            }
        }
    }

    private async initializeLastUpdateId(): Promise<void> {
        try {
            const url = `${this.workerUrl}/bot${this.botToken}/getUpdates`;
            const response = await axios.get(url, {
                params: {
                    limit: 1,
                    offset: -1
                }
            });
            
            const updates = response.data.result || [];
            if (updates.length > 0) {
                this.lastUpdateId = updates[0].update_id;
                this.logger.log(`Initialized lastUpdateId to ${this.lastUpdateId}`);
            } else {
                this.lastUpdateId = 0;
                this.logger.log('No updates found, initialized lastUpdateId to 0');
            }
        } catch (error) {
            this.logger.error(`Error initializing lastUpdateId: ${error.message}`);
            this.lastUpdateId = 0;
        }
    }

    private async startPolling(): Promise<void> {
        if (this.isPolling) return;
        
        this.isPolling = true;
        this.logger.log('Starting polling...');

        const poll = async () => {
            if (!this.isPolling) return;

            try {
                const updates = await this.getUpdates();
                
                for (const update of updates) {
                    this.lastUpdateId = update.update_id;
                    await this.handleUpdate(update);
                }
            } catch (error) {
                this.logger.error(`Polling error: ${error.message}`);
            }

            // Schedule next poll
            setTimeout(poll, 1000);
        };

        // Start polling
        poll();
    }

    async onModuleInit() {
        this.logger.log('🚀 Telegram bot starting...');
        await this.initializeLastUpdateId();
        await this.startPolling();
        this.logger.log('🚀 Telegram bot started');
    }

    async sendEmailVerificationCode(telegramId: string, code: string): Promise<void> {
        try {
            const message = `
🔐 *Verification Code*

Your verification code is: *${code}*

This code will expire in 5 minutes.
Please enter this code to verify your email address.`;

            await this.sendMessage(parseInt(telegramId), message, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            this.logger.error(`Error sending email verification code: ${error.message}`);
            throw error;
        }
    }
} 
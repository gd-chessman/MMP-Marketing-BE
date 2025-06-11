import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerifyCodeService } from '../../modules/verify-codes/verify-code.service';
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
                // Tạo mã code mới cho user
                const code = await this.verifyCodeService.generateCode(telegramId);
                
                const message = `
⭐️ *Welcome to MemePump Marketing* 🤘

Please click the button below to login.
This link will expire in 10 minutes.`;

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
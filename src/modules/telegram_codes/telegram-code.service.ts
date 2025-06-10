import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramCode } from './telegram-code.entity';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { MoreThan } from 'typeorm';

@Injectable()
export class TelegramCodeService {
    private workerUrl: string;
    private botToken: string;
    private readonly logger = new Logger(TelegramCodeService.name);

    constructor(
        private configService: ConfigService,
        @InjectRepository(TelegramCode)
        private telegramCodesRepository: Repository<TelegramCode>,
    ) {
        this.workerUrl = this.configService.get<string>('URL_WORKER', 'https://proxy.michosso2025.workers.dev');
        this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');

        if (!this.botToken) {
            throw new Error('TELEGRAM_BOT_TOKEN is missing in .env file');
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

    async generateCode(telegramId: string): Promise<string> {
        try {
            // Tạo mã code ngẫu nhiên 16 ký tự hex
            const code = randomBytes(16).toString('hex');
            
            // Tạo thời gian hết hạn (10 phút)
            const now = new Date();
            const expiresAt = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                now.getUTCHours(),
                now.getUTCMinutes() + 10,
                now.getUTCSeconds()
            ));
            // Tạo bản ghi mới trong database
            const telegramCode = this.telegramCodesRepository.create({
                code,
                telegram_id: telegramId,
                expires_at: expiresAt,
                is_used: false
            });

            await this.telegramCodesRepository.save(telegramCode);

            return code;
        } catch (error) {
            this.logger.error(`Error generating code: ${error.message}`);
            throw error;
        }
    }

    async verifyCode(code: string, telegramId: string): Promise<boolean> {
        try {
            const telegramCode = await this.telegramCodesRepository.findOne({
                where: {
                    code,
                    telegram_id: telegramId,
                    is_used: false
                }
            });

            if (!telegramCode) {
                return false;
            }

            // Kiểm tra hết hạn
            if (new Date() > telegramCode.expires_at) {
                return false;
            }

            // Đánh dấu mã đã được sử dụng
            telegramCode.is_used = true;
            await this.telegramCodesRepository.save(telegramCode);

            return true;
        } catch (error) {
            this.logger.error(`Error verifying code: ${error.message}`);
            return false;
        }
    }

    async getActiveCode(telegramId: string): Promise<TelegramCode | null> {
        try {
            return await this.telegramCodesRepository.findOne({
                where: {
                    telegram_id: telegramId,
                    is_used: false,
                    expires_at: MoreThan(new Date())
                }
            });
        } catch (error) {
            this.logger.error(`Error getting active code: ${error.message}`);
            return null;
        }
    }

    // Public method for external use
    async sendTelegramMessage(chatId: number, text: string): Promise<void> {
        try {
            await this.sendMessage(chatId, text);
        } catch (error) {
            this.logger.error(`Error sending Telegram message: ${error.message}`, error.stack);
            throw error;
        }
    }
}

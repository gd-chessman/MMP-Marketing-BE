import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramCodeModule } from '../../modules/telegram_codes/telegram-code.module';

@Module({
  imports: [
    ConfigModule,
    TelegramCodeModule,
  ],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {} 
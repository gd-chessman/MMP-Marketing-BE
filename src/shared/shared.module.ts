import { Module } from '@nestjs/common';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [TelegramBotModule, CacheModule],
  exports: [TelegramBotModule, CacheModule],
})
export class SharedModule {} 
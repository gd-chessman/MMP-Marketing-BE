import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';
import { VerifyCodeModule } from '../../modules/verify-codes/verify-code.module';

@Module({
  imports: [
    ConfigModule,
    VerifyCodeModule,
  ],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {} 
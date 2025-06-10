import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramCode } from './telegram-code.entity';
import { TelegramCodeService } from './telegram-code.service';
import { TelegramBotService } from './telegram-bot.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([TelegramCode])
    ],
    providers: [TelegramCodeService, TelegramBotService],
    exports: [TelegramCodeService, TelegramBotService]
})
export class TelegramCodeModule {} 
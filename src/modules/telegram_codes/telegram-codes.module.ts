import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramCodes } from './telegram-codes.entity';
import { TelegramCodesService } from './telegram-codes.service';
import { TelegramCodesController } from './telegram-codes.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([TelegramCodes])
    ],
    providers: [TelegramCodesService, TelegramBotService],
    controllers: [TelegramCodesController],
    exports: [TelegramCodesService, TelegramBotService]
})
export class TelegramCodesModule {} 
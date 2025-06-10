import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramCode } from './telegram-code.entity';
import { TelegramCodeService } from './telegram-code.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([TelegramCode])
    ],
    providers: [TelegramCodeService],
    exports: [TelegramCodeService]
})
export class TelegramCodeModule {} 
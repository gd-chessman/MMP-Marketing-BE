import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramBotService } from './telegram-bot.service';
import { VerifyCodeModule } from '../../modules/verify-codes/verify-code.module';
import { User } from '../../modules/users/user.entity';
import { Wallet } from '../../modules/wallets/wallet.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, Wallet]),
    VerifyCodeModule,
  ],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {} 
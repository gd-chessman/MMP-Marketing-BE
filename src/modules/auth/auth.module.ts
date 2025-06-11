import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TelegramCode } from '../telegram_codes/telegram-code.entity';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { JwtGuestStrategy } from './jwt-guest.strategy';
import { JwtGuestGuard } from './jwt-guest.guard';
import { GoogleAuthService } from './google-auth.service';
import { TelegramBotModule } from '../../shared/telegram-bot/telegram-bot.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([TelegramCode, User, Wallet]),
        HttpModule,
        TelegramBotModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN') },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        GoogleAuthService,
        JwtGuestStrategy,
        JwtGuestGuard
    ],
    exports: [AuthService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TelegramCodes } from '../telegram_codes/telegram-codes.entity';
import { UserWallet } from '../user-wallets/user-wallet.entity';
import { JwtUserWalletStrategy } from './jwt-user-wallet.strategy';

@Module({
    imports: [
        TypeOrmModule.forFeature([TelegramCodes, UserWallet]),
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
    providers: [AuthService, JwtUserWalletStrategy],
    exports: [AuthService],
})
export class AuthModule {}

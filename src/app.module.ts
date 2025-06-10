import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { appConfig } from './config/app.config';  // Import file config
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserWalletsModule } from './modules/user-wallets/user-wallets.module';
import { TelegramCodesModule } from './modules/telegram_codes/telegram-codes.module';
import { AuthModule } from './modules/auth/auth.module';



@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => databaseConfig(configService),
      inject: [ConfigService],
    }),
    UserWalletsModule,
    AuthModule,
    TelegramCodesModule,
  ],
  controllers: [AppController], // Các controller của ứng dụng
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    appConfig(consumer);  // Sử dụng cấu hình từ app.config.ts
  }
}

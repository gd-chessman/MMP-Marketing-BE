import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { appConfig } from './config/app.config';  // Import file config
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './modules/users/user.module';
import { WalletModule } from './modules/wallets/wallet.module';
import { VerifyCodeModule } from './modules/verify-codes/verify-code.module';
import { AuthModule } from './modules/auth/auth.module';
import { SharedModule } from './shared/shared.module';



@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => databaseConfig(configService),
      inject: [ConfigService],
    }),
    UserModule,
    WalletModule,
    AuthModule,
    VerifyCodeModule,
    SharedModule,
  ],
  controllers: [AppController], // Các controller của ứng dụng
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    appConfig(consumer);  // Sử dụng cấu hình từ app.config.ts
  }
}

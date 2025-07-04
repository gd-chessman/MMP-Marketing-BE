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
import { SwapOrderModule } from './modules/swap-orders/swap-order.module';
import { StakingPlanModule } from './modules/staking-plans/staking-plan.module';
import { UserStakeModule } from './modules/user-stakes/user-stake.module';
import { DepositWithdrawModule } from './modules/deposit-withdraws/deposit-withdraw.module';
import { AdminModule } from './modules/admin/admin.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { TokenSaleRoundModule } from './modules/token-sale-rounds/token-sale-round.module';
import { ReferralClickModule } from './modules/referral-clicks/referral-click.module';

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
    SwapOrderModule,
    StakingPlanModule,
    UserStakeModule,
    DepositWithdrawModule,
    AdminModule,
    WebsocketModule,
    TokenSaleRoundModule,
    ReferralClickModule,
  ],
  controllers: [AppController], // Các controller của ứng dụng
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    appConfig(consumer);  // Sử dụng cấu hình từ app.config.ts
  }
}

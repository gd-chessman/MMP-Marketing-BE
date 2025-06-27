import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAdmin } from './user-admins/user-admin.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuthModule } from './auth/auth.module';
import { UserAdminModule } from './user-admins/user-admin.module';
import { WalletModule } from './wallets/wallet.module';
import { TokenSaleRoundModule } from './token-sale-rounds/token-sale-round.module';
import { ReferralModule } from './referral/referral.module';
import { StakeModule } from './stakes/stake.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAdmin]),
    AuthModule,
    UserAdminModule,
    WalletModule,
    TokenSaleRoundModule,
    ReferralModule,
    StakeModule,
  ],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {} 
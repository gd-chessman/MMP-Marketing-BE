import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../../wallets/wallet.entity';
import { SwapOrder } from '../../swap-orders/swap-order.entity';
import { ReferralReward } from '../../referral-rewards/referral-reward.entity';
import { ReferralClick } from '../../referral-clicks/referral-click.entity';
import { UserStake } from '../../user-stakes/user-stake.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      SwapOrder,
      ReferralReward,
      ReferralClick,
      UserStake
    ])
  ],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { Wallet } from '../../wallets/wallet.entity';
import { ReferralReward } from '../../referral-rewards/referral-reward.entity';
import { ReferralClick } from '../../referral-clicks/referral-click.entity';
import { SwapOrder } from '../../swap-orders/swap-order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, ReferralReward, ReferralClick, SwapOrder]),
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralRewardController } from './referral-reward.controller';
import { ReferralRewardService } from './referral-reward.service';
import { ReferralReward } from './referral-reward.entity';
import { SolAuthorityMonitorService } from './sol-authority-monitor.service';
import { Wallet } from '../wallets/wallet.entity';
import { SwapOrder } from '../swap-orders/swap-order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralReward, Wallet, SwapOrder]),
  ],
  controllers: [ReferralRewardController],
  providers: [ReferralRewardService, SolAuthorityMonitorService],
  exports: [ReferralRewardService, SolAuthorityMonitorService],
})
export class ReferralRewardModule {} 
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SwapOrder } from './swap-order.entity';
import { Wallet } from '../wallets/wallet.entity';
import { SwapOrderService } from './swap-order.service';
import { SwapOrderController } from './swap-order.controller';
import { SwapOrderCronService } from './swap-order-cron.service';
import { ReferralRewardModule } from '../referral-rewards/referral-reward.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SwapOrder, Wallet]),
    ScheduleModule.forRoot(),
    ReferralRewardModule,
  ],
  providers: [SwapOrderService, SwapOrderCronService],
  controllers: [SwapOrderController],
  exports: [SwapOrderService],
})
export class SwapOrderModule {} 
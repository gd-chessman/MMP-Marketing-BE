import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserStake } from './user-stake.entity';
import { UserStakeService } from './user-stake.service';
import { UserStakeController } from './user-stake.controller';
import { StakingPlan } from '../staking-plans/staking-plan.entity';
import { Wallet } from '../wallets/wallet.entity';
import { WalletModule } from '../wallets/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserStake, StakingPlan, Wallet]),
    WalletModule
  ],
  providers: [UserStakeService],
  controllers: [UserStakeController],
  exports: [UserStakeService],
})
export class UserStakeModule {} 
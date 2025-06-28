import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralClick } from './referral-click.entity';
import { Wallet } from '../wallets/wallet.entity';
import { ReferralClickController } from './referral-click.controller';
import { ReferralClickService } from './referral-click.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralClick, Wallet]),
  ],
  controllers: [ReferralClickController],
  providers: [ReferralClickService],
  exports: [ReferralClickService],
})
export class ReferralClickModule {} 
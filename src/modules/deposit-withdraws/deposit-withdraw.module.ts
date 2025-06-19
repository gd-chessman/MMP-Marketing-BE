import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositWithdraw } from './deposit-withdraw.entity';
import { DepositWithdrawService } from './deposit-withdraw.service';
import { DepositWithdrawController } from './deposit-withdraw.controller';
import { Wallet } from '../wallets/wallet.entity';
import { SwapOrderModule } from '../swap-orders/swap-order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DepositWithdraw]), 
    Wallet,
    SwapOrderModule
  ],
  providers: [DepositWithdrawService],
  controllers: [DepositWithdrawController],
  exports: [DepositWithdrawService],
})
export class DepositWithdrawModule {} 
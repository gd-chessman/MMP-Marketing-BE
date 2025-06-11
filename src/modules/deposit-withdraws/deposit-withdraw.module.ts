import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositWithdraw } from './deposit-withdraw.entity';
import { DepositWithdrawService } from './deposit-withdraw.service';
import { DepositWithdrawController } from './deposit-withdraw.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DepositWithdraw])],
  providers: [DepositWithdrawService],
  controllers: [DepositWithdrawController],
  exports: [DepositWithdrawService],
})
export class DepositWithdrawModule {} 
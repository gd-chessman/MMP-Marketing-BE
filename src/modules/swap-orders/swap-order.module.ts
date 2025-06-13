import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SwapOrder } from './swap-order.entity';
import { Wallet } from '../wallets/wallet.entity';
import { SwapOrderService } from './swap-order.service';
import { SwapOrderController } from './swap-order.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SwapOrder, Wallet])],
  providers: [SwapOrderService],
  controllers: [SwapOrderController],
  exports: [SwapOrderService],
})
export class SwapOrderModule {} 
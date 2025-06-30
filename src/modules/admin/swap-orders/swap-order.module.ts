import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SwapOrder } from '../../swap-orders/swap-order.entity';
import { Wallet } from '../../wallets/wallet.entity';
import { SwapOrderController } from './swap-order.controller';
import { SwapOrderService } from './swap-order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SwapOrder, Wallet]),
  ],
  controllers: [SwapOrderController],
  providers: [SwapOrderService],
  exports: [SwapOrderService],
})
export class SwapOrderModule {}

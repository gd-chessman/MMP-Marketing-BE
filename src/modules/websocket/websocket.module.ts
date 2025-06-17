import { Module } from '@nestjs/common';
import { WalletBalanceGateway } from './wallet-balance.gateway';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [WalletBalanceGateway],
  exports: [WalletBalanceGateway],
})
export class WebsocketModule {}

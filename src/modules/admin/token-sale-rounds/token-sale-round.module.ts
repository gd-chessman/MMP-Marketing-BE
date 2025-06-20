import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenSaleRound } from '../../token-sale-rounds/token-sale-round.entity';
import { TokenSaleRoundController } from './token-sale-round.controller';
import { TokenSaleRoundService } from './token-sale-round.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokenSaleRound])],
  controllers: [TokenSaleRoundController],
  providers: [TokenSaleRoundService],
  exports: [TokenSaleRoundService],
})
export class TokenSaleRoundModule {}

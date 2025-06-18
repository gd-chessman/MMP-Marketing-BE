import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenSaleRound } from './token-sale-round.entity';
import { TokenSaleRoundService } from './token-sale-round.service';
import { TokenSaleRoundController } from './token-sale-round.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TokenSaleRound])],
  controllers: [TokenSaleRoundController],
  providers: [TokenSaleRoundService],
})
export class TokenSaleRoundModule {}

import { Controller, Get } from '@nestjs/common';
import { TokenSaleRoundService } from './token-sale-round.service';

@Controller('token-sale-rounds')
export class TokenSaleRoundController {
  constructor(private readonly tokenSaleRoundService: TokenSaleRoundService) {}

  @Get()
  async findAll() {
    return this.tokenSaleRoundService.findAll();
  }
}

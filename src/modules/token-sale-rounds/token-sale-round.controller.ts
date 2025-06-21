import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TokenSaleRoundService } from './token-sale-round.service';
import { TokenSaleStatisticsDto, TokenSaleStatisticsSummaryDto } from './dto/token-sale-statistics.dto';

@Controller('token-sale-rounds')
export class TokenSaleRoundController {
  constructor(private readonly tokenSaleRoundService: TokenSaleRoundService) {}

  @Get()
  async findAll() {
    return this.tokenSaleRoundService.findAll();
  }

  /**
   * Lấy thống kê token sale cho một round cụ thể
   */
  @Get(':id/statistics')
  async getTokenSaleStatistics(@Param('id', ParseIntPipe) id: number): Promise<TokenSaleStatisticsDto> {
    return this.tokenSaleRoundService.getTokenSaleStatistics(id);
  }
}

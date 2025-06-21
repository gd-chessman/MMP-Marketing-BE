import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { TokenSaleRoundService } from './token-sale-round.service';
import { TokenSaleStatisticsDto, TokenSaleStatisticsSummaryDto } from './dto/token-sale-statistics.dto';
import { Status } from './token-sale-round.entity';

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
  @Get('statistics/:id')
  async getTokenSaleStatistics(@Param('id', ParseIntPipe) id: number): Promise<TokenSaleStatisticsDto> {
    return this.tokenSaleRoundService.getTokenSaleStatistics(id);
  }

  /**
   * Lấy token sale rounds theo status và thống kê tổng hợp
   */
  @Get('statistics')
  async getTokenSaleStatisticsByStatus(
    @Query('status') status?: Status
  ): Promise<{ rounds: TokenSaleStatisticsDto[], summary: TokenSaleStatisticsSummaryDto }> {
    return this.tokenSaleRoundService.getTokenSaleStatisticsByStatus(status);
  }
}

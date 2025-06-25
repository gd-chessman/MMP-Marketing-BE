import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, ClassSerializerInterceptor, UseInterceptors, ParseIntPipe } from '@nestjs/common';
import { TokenSaleRoundService } from './token-sale-round.service';
import { CreateTokenSaleRoundDto } from './dto/create-token-sale-round.dto';
import { Status, TokenSaleRound } from '../../token-sale-rounds/token-sale-round.entity';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { TokenSaleStatisticsDto, TokenSaleStatisticsSummaryDto } from '../../token-sale-rounds/dto/token-sale-statistics.dto';
import { SearchTokenSaleRoundsDto } from './dto/search-token-sale-rounds.dto';

@Controller('admin/token-sale-rounds')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class TokenSaleRoundController {
  constructor(private readonly tokenSaleRoundService: TokenSaleRoundService) {}

  @Post()
  create(@Body() createTokenSaleRoundDto: CreateTokenSaleRoundDto) {
    return this.tokenSaleRoundService.create(createTokenSaleRoundDto);
  }

  @Get()
  async findAll(@Query() searchDto: SearchTokenSaleRoundsDto) {
    return this.tokenSaleRoundService.findAll(searchDto);
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

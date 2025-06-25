import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, ClassSerializerInterceptor, UseInterceptors, ParseIntPipe, Put } from '@nestjs/common';
import { TokenSaleRoundService } from './token-sale-round.service';
import { CreateTokenSaleRoundDto } from './dto/create-token-sale-round.dto';
import { UpdateTokenSaleRoundDto } from './dto/update-token-sale-round.dto';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { SearchTokenSaleRoundsDto } from './dto/search-token-sale-rounds.dto';
import { TokenSaleStatisticsDto } from '../../token-sale-rounds/dto/token-sale-statistics.dto';
import { TokenSaleOverviewDto } from './dto/token-sale-overview.dto';

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


  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateTokenSaleRoundDto: UpdateTokenSaleRoundDto) {
    return this.tokenSaleRoundService.update(id, updateTokenSaleRoundDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tokenSaleRoundService.remove(id);
  }

  /**
   * Lấy thống kê token sale cho một round cụ thể
   */
  @Get('statistics/:id')
  async getTokenSaleStatistics(@Param('id', ParseIntPipe) id: number): Promise<TokenSaleStatisticsDto> {
    return this.tokenSaleRoundService.getTokenSaleStatistics(id);
  }

  /**
   * Lấy thống kê tổng quan token sale cho tất cả rounds
   */
  @Get('statistics')
  async getTokenSaleStatisticsByStatus(): Promise<TokenSaleOverviewDto> {
    return this.tokenSaleRoundService.getTokenSaleStatisticsByStatus();
  }
}

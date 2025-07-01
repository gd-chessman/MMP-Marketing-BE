import { Controller, Get, Query, Param, ParseIntPipe, UseGuards, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { ReferralService } from './referral.service';
import { SearchReferralRankingDto } from './dto/search-referral-ranking.dto';
import { ClickStatisticsDto } from './dto/click-statistics.dto';
import { WalletClickStatisticsDto } from './dto/wallet-click-statistics.dto';
import { WalletReferralStatisticsDto, ReferredWalletsResponseDto, ReferralRewardHistoryResponseDto } from './dto/referral-statistics.dto';

@Controller('admin/referral')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class ReferralController {
  constructor(private referralService: ReferralService) {}

  @Get('ranking')
  async getReferralRanking(@Query() searchDto: SearchReferralRankingDto) {
    return this.referralService.getReferralRanking(searchDto);
  }

  @Get('statistics/performance')
  async getReferralStatistics() {
    return this.referralService.getReferralStatistics();
  }

  @Get('statistics/clicks')
  async getClickStatistics(): Promise<ClickStatisticsDto> {
    return this.referralService.getClickStatistics();
  }

  @Get('clicks/:walletId')
  async getWalletClickStatistics(@Param('walletId', ParseIntPipe) walletId: number): Promise<WalletClickStatisticsDto> {
    return this.referralService.getWalletClickStatistics(walletId);
  }

  @Get('statistics/:walletId')
  async getWalletReferralStatistics(@Param('walletId', ParseIntPipe) walletId: number): Promise<WalletReferralStatisticsDto> {
    return this.referralService.getWalletReferralStatistics(walletId);
  }

  @Get('referred-wallets/:walletId')
  async getReferredWallets(
    @Param('walletId', ParseIntPipe) walletId: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<ReferredWalletsResponseDto> {
    return this.referralService.getReferredWallets(walletId, page, limit);
  }

  @Get('reward-history/:referrerWalletId/:referredWalletId')
  async getReferralRewardHistory(
    @Param('referrerWalletId', ParseIntPipe) referrerWalletId: number,
    @Param('referredWalletId', ParseIntPipe) referredWalletId: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<ReferralRewardHistoryResponseDto> {
    return this.referralService.getReferralRewardHistory(
      referrerWalletId, 
      referredWalletId, 
      page, 
      limit
    );
  }
}

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ReferralRewardService } from './referral-reward.service';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';
import { JwtAdminGuard } from '../admin/auth/jwt-admin.guard';
import { ReferralReward } from './referral-reward.entity';
import { ReferralStatisticsDto } from './dto/referral-statistics.dto';

@Controller('referral-rewards')
export class ReferralRewardController {
  constructor(private readonly referralRewardService: ReferralRewardService) {}

  @UseGuards(JwtGuestGuard)
  @Get()
  async getMyReferralRewards(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50'
  ): Promise<{ data: ReferralReward[]; total: number; page: number; limit: number }> {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    return this.referralRewardService.findByWalletId(req.user.wallet.id, pageNum, limitNum);
  }

  @UseGuards(JwtGuestGuard)
  @Get('by-address/:walletAddress')
  async getReferralRewardsByAddress(
    @Req() req: any,
    @Param('walletAddress') walletAddress: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50'
  ): Promise<{ data: ReferralReward[]; total: number; page: number; limit: number }> {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    return this.referralRewardService.findByReferrerAndReferredAddress(req.user.wallet.id, walletAddress, pageNum, limitNum);
  }

  @UseGuards(JwtGuestGuard)
  @Get('statistics')
  async getMyReferralStatistics(@Req() req: any): Promise<ReferralStatisticsDto> {
    return this.referralRewardService.getReferralStatistics(req.user.wallet.id);
  }
} 
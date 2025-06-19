import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ReferralRewardService } from './referral-reward.service';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';
import { JwtAdminGuard } from '../admin/auth/jwt-admin.guard';
import { ReferralReward } from './referral-reward.entity';

@Controller('referral-rewards')
export class ReferralRewardController {
  constructor(private readonly referralRewardService: ReferralRewardService) {}


  @UseGuards(JwtGuestGuard)
  @Get()
  async getMyReferralRewards(@Req() req: any): Promise<ReferralReward[]> {
    return this.referralRewardService.findByWalletId(req.user.wallet.id);
  }
} 
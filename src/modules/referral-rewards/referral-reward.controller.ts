import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReferralRewardService } from './referral-reward.service';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';
import { JwtAdminGuard } from '../admin/auth/jwt-admin.guard';

@Controller('referral-rewards')
export class ReferralRewardController {
  constructor(private readonly referralRewardService: ReferralRewardService) {}

  // Lấy danh sách referral rewards (có thể filter theo wallet, status, etc.)
  @Get()
  @UseGuards(JwtGuestGuard)
  async findAll(@Query() query: any) {
    // TODO: Implement get all referral rewards with filters
  }

} 
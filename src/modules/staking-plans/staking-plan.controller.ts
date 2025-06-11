import { Controller, Get, UseGuards } from '@nestjs/common';
import { StakingPlanService } from './staking-plan.service';
import { StakingPlan } from './staking-plan.entity';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';

@Controller('staking-plans')
export class StakingPlanController {
  constructor(private readonly stakingPlanService: StakingPlanService) {}

  @Get()
  @UseGuards(JwtGuestGuard)
  async findAll(): Promise<StakingPlan[]> {
    return this.stakingPlanService.findAll();
  }

  // Các route sẽ được thêm sau
} 
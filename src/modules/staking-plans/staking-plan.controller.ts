import { Controller } from '@nestjs/common';
import { StakingPlanService } from './staking-plan.service';

@Controller('staking-plans')
export class StakingPlanController {
  constructor(private readonly stakingPlanService: StakingPlanService) {}

  // Các route sẽ được thêm sau
} 
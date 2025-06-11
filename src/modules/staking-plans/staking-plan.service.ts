import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StakingPlan } from './staking-plan.entity';

@Injectable()
export class StakingPlanService {
  constructor(
    @InjectRepository(StakingPlan)
    private stakingPlanRepository: Repository<StakingPlan>,
  ) {}

  // Các phương thức sẽ được thêm sau
} 
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StakingPlan } from './staking-plan.entity';
import { StakingPlanService } from './staking-plan.service';
import { StakingPlanController } from './staking-plan.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StakingPlan])],
  providers: [StakingPlanService],
  controllers: [StakingPlanController],
  exports: [StakingPlanService],
})
export class StakingPlanModule {} 
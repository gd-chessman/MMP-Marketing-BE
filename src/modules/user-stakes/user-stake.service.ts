import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStake, UserStakeStatus } from './user-stake.entity';
import { CreateUserStakeDto } from './dto/create-user-stake.dto';
import { StakingPlan } from '../staking-plans/staking-plan.entity';

@Injectable()
export class UserStakeService {
  constructor(
    @InjectRepository(UserStake)
    private userStakeRepository: Repository<UserStake>,
    @InjectRepository(StakingPlan)
    private stakingPlanRepository: Repository<StakingPlan>,
  ) {}

  async create(walletId: number, createUserStakeDto: CreateUserStakeDto): Promise<UserStake> {
    // Lấy thông tin staking plan
    const stakingPlan = await this.stakingPlanRepository.findOne({
      where: { id: createUserStakeDto.staking_plan_id }
    });

    if (!stakingPlan) {
      throw new NotFoundException(`Staking plan with id ${createUserStakeDto.staking_plan_id} not found`);
    }

    // Tính toán start_date và end_date
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + stakingPlan.period_days);

    const userStake = this.userStakeRepository.create({
      ...createUserStakeDto,
      wallet_id: walletId,
      start_date: startDate,
      end_date: endDate,
      status: UserStakeStatus.ACTIVE,
    });
    return await this.userStakeRepository.save(userStake);
  }

  async findByWalletId(walletId: number): Promise<UserStake[]> {
    const stakes = await this.userStakeRepository.find({
      where: { wallet_id: walletId },
      relations: ['staking_plan'],
      order: { created_at: 'DESC' },
    });

    if (!stakes.length) {
      throw new NotFoundException(`No stakes found for wallet ${walletId}`);
    }

    return stakes;
  }
} 
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStake, UserStakeStatus } from '../../user-stakes/user-stake.entity';
import { SearchStakesDto } from './dto/search-stakes.dto';
import { StakeStatisticsDto } from './dto/stake-statistics.dto';

@Injectable()
export class StakeService {
  constructor(
    @InjectRepository(UserStake)
    private userStakeRepository: Repository<UserStake>,
  ) {}

  async findAll(searchStakesDto: SearchStakesDto) {
    const { page = 1, limit = 10, search, status, wallet_id, staking_plan_id } = searchStakesDto;
    const skip = (page - 1) * limit;
    
    let queryBuilder = this.userStakeRepository
      .createQueryBuilder('userStake')
      .leftJoinAndSelect('userStake.wallet', 'wallet')
      .leftJoinAndSelect('userStake.staking_plan', 'stakingPlan')
      .leftJoinAndSelect('wallet.user', 'user');

    // Lọc theo status
    if (status) {
      queryBuilder = queryBuilder.andWhere('userStake.status = :status', { status });
    }

    // Lọc theo wallet_id
    if (wallet_id) {
      queryBuilder = queryBuilder.andWhere('userStake.wallet_id = :wallet_id', { wallet_id });
    }

    // Lọc theo staking_plan_id
    if (staking_plan_id) {
      queryBuilder = queryBuilder.andWhere('userStake.staking_plan_id = :staking_plan_id', { staking_plan_id });
    }

    // Lọc theo search
    if (search) {
      const searchCondition = '(wallet.sol_address ILIKE :search OR ' +
        'user.telegram_id ILIKE :search OR ' +
        'user.email ILIKE :search OR ' +
        'userStake.staking_tx_signature ILIKE :search OR ' +
        'userStake.unstaking_tx_signature ILIKE :search OR ' +
        'CAST(userStake.stake_id AS TEXT) ILIKE :search)';
      
      queryBuilder = queryBuilder.andWhere(searchCondition, { search: `%${search}%` });
    }

    const [stakes, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('userStake.created_at', 'DESC')
      .getManyAndCount();

    return {
      status: true,
      data: stakes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getStatistics(): Promise<StakeStatisticsDto> {
    // Tổng số stakes
    const totalStakes = await this.userStakeRepository.count();

    // Stakes theo status
    const activeStakes = await this.userStakeRepository.count({
      where: { status: UserStakeStatus.ACTIVE }
    });

    const completedStakes = await this.userStakeRepository.count({
      where: { status: UserStakeStatus.COMPLETED }
    });

    const cancelledStakes = await this.userStakeRepository.count({
      where: { status: UserStakeStatus.CANCELLED }
    });

    // Tổng amount staked và claimed
    const totalAmountStaked = await this.userStakeRepository
      .createQueryBuilder('userStake')
      .select('SUM(userStake.amount_staked)', 'total')
      .getRawOne();

    const totalAmountClaimed = await this.userStakeRepository
      .createQueryBuilder('userStake')
      .select('SUM(COALESCE(userStake.amount_claimed, 0))', 'total')
      .getRawOne();

    return {
      total_stakes: totalStakes,
      active_stakes: activeStakes,
      completed_stakes: completedStakes,
      cancelled_stakes: cancelledStakes,
      total_amount_staked: parseFloat(totalAmountStaked?.total || '0'),
      total_amount_claimed: parseFloat(totalAmountClaimed?.total || '0')
    };
  }
}

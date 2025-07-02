import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStake, UserStakeStatus } from '../../user-stakes/user-stake.entity';
import { SearchStakesDto } from './dto/search-stakes.dto';
import { StakeStatisticsDto } from './dto/stake-statistics.dto';
import { StakeListResponseDto, StakeResponseDto } from './dto/stake-response.dto';

@Injectable()
export class StakeService {
  constructor(
    @InjectRepository(UserStake)
    private userStakeRepository: Repository<UserStake>,
  ) {}

  async findAll(searchStakesDto: SearchStakesDto): Promise<StakeListResponseDto> {
    const { page = 1, limit = 10, search, status, wallet_id, staking_plan_id } = searchStakesDto;
    const skip = (page - 1) * limit;
    
    const queryBuilder = this.userStakeRepository
      .createQueryBuilder('userStake')
      .leftJoin('userStake.wallet', 'wallet')
      .leftJoin('userStake.staking_plan', 'stakingPlan')
      .select([
        'userStake.id',
        'userStake.wallet_id',
        'userStake.staking_plan_id',
        'userStake.stake_id',
        'userStake.stake_account_pda',
        'userStake.staking_tx_signature',
        'userStake.unstaking_tx_signature',
        'userStake.amount_staked',
        'userStake.amount_claimed',
        'userStake.start_date',
        'userStake.end_date',
        'userStake.status',
        'userStake.created_at',
        'userStake.updated_at',
        'wallet.sol_address',
        'stakingPlan.name',
        'stakingPlan.interest_rate',
        'stakingPlan.period_days'
      ]);

    // Lọc theo status
    if (status) {
      queryBuilder.andWhere('userStake.status = :status', { status });
    }

    // Lọc theo wallet_id
    if (wallet_id) {
      queryBuilder.andWhere('userStake.wallet_id = :wallet_id', { wallet_id });
    }

    // Lọc theo staking_plan_id
    if (staking_plan_id) {
      queryBuilder.andWhere('userStake.staking_plan_id = :staking_plan_id', { staking_plan_id });
    }

    // Lọc theo search
    if (search) {
      queryBuilder.andWhere(
        '(wallet.sol_address LIKE :search OR ' +
        'userStake.staking_tx_signature LIKE :search OR ' +
        'userStake.unstaking_tx_signature LIKE :search OR ' +
        'CAST(userStake.stake_id AS TEXT) LIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('userStake.created_at', 'DESC')
      .getManyAndCount();

    // Transform data
    const transformedData: StakeResponseDto[] = data.map(item => ({
      id: item.id,
      wallet_id: item.wallet_id,
      wallet_address: item.wallet?.sol_address || '',
      staking_plan_id: item.staking_plan_id,
      staking_plan_name: item.staking_plan?.name || '',
      staking_plan_interest_rate: item.staking_plan?.interest_rate || 0,
      staking_plan_period_days: item.staking_plan?.period_days || 0,
      stake_id: item.stake_id,
      stake_account_pda: item.stake_account_pda,
      staking_tx_signature: item.staking_tx_signature,
      unstaking_tx_signature: item.unstaking_tx_signature || '',
      amount_staked: parseFloat(item.amount_staked.toString()),
      amount_claimed: parseFloat(item.amount_claimed?.toString() || '0'),
      start_date: item.start_date,
      end_date: item.end_date,
      status: item.status,
      created_at: item.created_at,
      updated_at: item.updated_at
    }));

    return {
      status: true,
      data: transformedData,
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

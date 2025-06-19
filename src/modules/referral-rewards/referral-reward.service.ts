import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ReferralReward, RewardStatus } from './referral-reward.entity';
import { Wallet } from '../wallets/wallet.entity';
import { SwapOrder } from '../swap-orders/swap-order.entity';

@Injectable()
export class ReferralRewardService {
  constructor(
    @InjectRepository(ReferralReward)
    private readonly referralRewardRepository: Repository<ReferralReward>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(SwapOrder)
    private readonly swapOrderRepository: Repository<SwapOrder>,
  ) {}

  // Lấy tất cả referral rewards với filter
  async findAll(query: any): Promise<{ data: ReferralReward[]; total: number }> {
    // TODO: Implement find all with filters
    throw new Error('Method not implemented.');
  }

} 
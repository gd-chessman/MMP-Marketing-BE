import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallets/wallet.entity';
import { SwapOrder, SwapOrderStatus, TokenType } from '../../swap-orders/swap-order.entity';
import { ReferralReward } from '../../referral-rewards/referral-reward.entity';
import { ReferralClick } from '../../referral-clicks/referral-click.entity';
import { UserStake, UserStakeStatus } from '../../user-stakes/user-stake.entity';
import { WalletStatisticsDto } from './dto/wallet-statistics.dto';
import { ReferralStatisticsDto } from './dto/referral-statistics.dto';
import { WalletTypeFilter } from './dto/search-wallets.dto';
import { WalletDetailStatisticsDto } from './dto/wallet-detail-statistics.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
    @InjectRepository(ReferralReward)
    private referralRewardRepository: Repository<ReferralReward>,
    @InjectRepository(ReferralClick)
    private referralClickRepository: Repository<ReferralClick>,
    @InjectRepository(UserStake)
    private userStakeRepository: Repository<UserStake>,
  ) {}

  async findAll(page = 1, limit = 10, search?: string, type?: string, wallet_type: WalletTypeFilter = WalletTypeFilter.ALL) {
    const skip = (page - 1) * limit;
    
    let queryBuilder = this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoinAndSelect('wallet.user', 'user');

    // Lọc theo type
    if (type === 'telegram') {
      // Ví có telegram_id
      queryBuilder = queryBuilder
        .where('wallet.user_id IS NOT NULL')
        .andWhere('user.telegram_id IS NOT NULL');
    } else if (type === 'google') {
      // Ví có email
      queryBuilder = queryBuilder
        .where('wallet.user_id IS NOT NULL')
        .andWhere('user.email IS NOT NULL');
    } else if (type === 'phantom') {
      // Phantom (không có user)
      queryBuilder = queryBuilder.where('wallet.user_id IS NULL');
    }

    // Lọc theo wallet_type
    if (wallet_type !== WalletTypeFilter.ALL) {
      if (type) {
        queryBuilder = queryBuilder.andWhere('wallet.wallet_type = :walletType', { 
          walletType: wallet_type 
        });
      } else {
        queryBuilder = queryBuilder.where('wallet.wallet_type = :walletType', { 
          walletType: wallet_type 
        });
      }
    }

    // Lọc theo search
    if (search) {
      const searchCondition = '(wallet.sol_address ILIKE :search OR ' +
        'user.telegram_id ILIKE :search OR ' +
        'user.email ILIKE :search OR ' +
        'wallet.referral_code ILIKE :search OR ' +
        'CAST(wallet.wallet_type AS TEXT) ILIKE :search)';
      
      if (type || wallet_type !== WalletTypeFilter.ALL) {
        queryBuilder = queryBuilder.andWhere(searchCondition, { search: `%${search}%` });
      } else {
        queryBuilder = queryBuilder.where(searchCondition, { search: `%${search}%` });
      }
    }

    const [wallets, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('wallet.created_at', 'DESC')
      .getManyAndCount();

    return {
      status: true,
      data: wallets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getStatistics(): Promise<WalletStatisticsDto> {
    // Tổng số ví
    const totalWallets = await this.walletRepository.count();

    // Ví dùng Telegram (có telegram_id)
    const telegramWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoin('wallet.user', 'user')
      .where('user.telegram_id IS NOT NULL')
      .getCount();

    // Ví dùng Google (có email)
    const googleWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoin('wallet.user', 'user')
      .where('user.email IS NOT NULL')
      .getCount();

    // Ví Phantom (user là null)
    const phantomWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('wallet.user_id IS NULL')
      .getCount();

    return {
      total_wallets: totalWallets,
      telegram_wallets: telegramWallets,
      google_wallets: googleWallets,
      phantom_wallets: phantomWallets
    };
  }

  async updateWalletType(id: number, walletType: string) {
    const wallet = await this.walletRepository.findOne({ where: { id } });
    
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    wallet.wallet_type = walletType as any;
    await this.walletRepository.save(wallet);

    return {
      status: true,
      message: 'Wallet type updated successfully',
    };
  }

  async getReferralStatistics(walletId: number): Promise<ReferralStatisticsDto> {
    // Tìm ví theo ID
    const wallet = await this.walletRepository.findOne({ 
      where: { id: walletId },
      relations: ['user']
    });
    
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Tìm thông tin người giới thiệu (nếu có)
    let referredByInfo = null;
    if (wallet.referred_by) {
      const referrerWallet = await this.walletRepository
        .createQueryBuilder('wallet')
        .leftJoin('wallet.user', 'user')
        .select([
          'wallet.id',
          'wallet.sol_address',
          'wallet.referral_code',
          'user.telegram_id',
          'user.email'
        ])
        .where('wallet.referral_code = :referralCode', { referralCode: wallet.referred_by })
        .getOne();

      if (referrerWallet) {
        referredByInfo = {
          wallet_id: referrerWallet.id,
          sol_address: referrerWallet.sol_address,
          referral_code: referrerWallet.referral_code,
          user_telegram_id: referrerWallet.user?.telegram_id,
          user_email: referrerWallet.user?.email
        };
      }
    }

    // Tìm tất cả ví được giới thiệu bởi ví này
    const referredWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoin('wallet.user', 'user')
      .select([
        'wallet.id',
        'wallet.sol_address',
        'wallet.created_at',
        'user.telegram_id',
        'user.email'
      ])
      .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
      .orderBy('wallet.created_at', 'DESC')
      .getMany();

    return {
      wallet_id: wallet.id,
      sol_address: wallet.sol_address,
      referral_code: wallet.referral_code,
      total_referred_wallets: referredWallets.length,
      referred_by_info: referredByInfo,
      referred_wallets: referredWallets.map(w => ({
        id: w.id,
        sol_address: w.sol_address,
        created_at: w.created_at,
        user_telegram_id: w.user?.telegram_id,
        user_email: w.user?.email
      }))
    };
  }

  async getWalletDetailStatistics(walletId: number): Promise<WalletDetailStatisticsDto> {
    // Tìm ví theo ID
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId }
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Tính toán thời gian
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);

    // === THỐNG KÊ SWAP ===
    const swapStats = await this.swapOrderRepository
      .createQueryBuilder('swap_order')
      .where('swap_order.wallet_id = :walletId', { walletId })
      .select([
        'swap_order.status',
        'swap_order.input_token',
        'swap_order.input_amount',
        'swap_order.mmp_received',
        'swap_order.mpb_received'
      ])
      .getMany();

    let totalSwapOrders = swapStats.length;
    let completedSwaps = 0;
    let pendingSwaps = 0;
    let failedSwaps = 0;
    let totalSolSwapped = 0;
    let totalUsdtSwapped = 0;
    let totalUsdcSwapped = 0;
    let totalMmpReceived = 0;
    let totalMpbReceived = 0;

    swapStats.forEach(swap => {
      if (swap.status === SwapOrderStatus.COMPLETED) {
        completedSwaps++;
      } else if (swap.status === SwapOrderStatus.PENDING) {
        pendingSwaps++;
      } else if (swap.status === SwapOrderStatus.FAILED) {
        failedSwaps++;
      }

      if (swap.status === SwapOrderStatus.COMPLETED) {
        if (swap.input_token === TokenType.SOL) {
          totalSolSwapped += parseFloat(swap.input_amount.toString());
        } else if (swap.input_token === TokenType.USDT) {
          totalUsdtSwapped += parseFloat(swap.input_amount.toString());
        } else if (swap.input_token === TokenType.USDC) {
          totalUsdcSwapped += parseFloat(swap.input_amount.toString());
        }

        totalMmpReceived += parseFloat(swap.mmp_received?.toString() || '0');
        totalMpbReceived += parseFloat(swap.mpb_received?.toString() || '0');
      }
    });

    // === THỐNG KÊ REFERRAL ===
    // Thống kê giới thiệu
    const totalReferrals = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
      .getCount();

    const referralsThisMonth = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
      .andWhere('wallet.created_at >= :startOfMonth', { startOfMonth })
      .getCount();

    const referralsThisWeek = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
      .andWhere('wallet.created_at >= :startOfWeek', { startOfWeek })
      .getCount();

    // Thống kê thu nhập đã thanh toán
    const totalEarningsSOL = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .andWhere('reward.status = :status', { status: 'paid' })
      .andWhere('reward.reward_token = :token', { token: 'SOL' })
      .select('SUM(reward.reward_amount)', 'total')
      .getRawOne();

    const totalEarningsMMP = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .andWhere('reward.status = :status', { status: 'paid' })
      .andWhere('reward.reward_token = :token', { token: 'MMP' })
      .select('SUM(reward.reward_amount)', 'total')
      .getRawOne();

    // Thống kê thu nhập đang chờ
    const totalPendingRewardSOL = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .andWhere('reward.status = :status', { status: 'pending' })
      .andWhere('reward.reward_token = :token', { token: 'SOL' })
      .select('SUM(reward.reward_amount)', 'total')
      .getRawOne();

    const totalPendingRewardMMP = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .andWhere('reward.status = :status', { status: 'pending' })
      .andWhere('reward.reward_token = :token', { token: 'MMP' })
      .select('SUM(reward.reward_amount)', 'total')
      .getRawOne();

    const totalWaitBalanceRewardSOL = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .andWhere('reward.status = :status', { status: 'wait_balance' })
      .andWhere('reward.reward_token = :token', { token: 'SOL' })
      .select('SUM(reward.reward_amount)', 'total')
      .getRawOne();

    const totalWaitBalanceRewardMMP = await this.referralRewardRepository
      .createQueryBuilder('reward')
      .where('reward.referrer_wallet_id = :walletId', { walletId })
      .andWhere('reward.status = :status', { status: 'wait_balance' })
      .andWhere('reward.reward_token = :token', { token: 'MMP' })
      .select('SUM(reward.reward_amount)', 'total')
      .getRawOne();

    // Thống kê click
    const clickStats = await this.referralClickRepository.findOne({
      where: { wallet_id: walletId }
    });

    let totalClicks = 0;
    let clicksToday = 0;
    let clicksThisWeek = 0;
    let clicksThisMonth = 0;

    if (clickStats) {
      totalClicks = clickStats.total_clicks;
      
      // Tính click real-time
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (clickStats.last_click_at && new Date(clickStats.last_click_at) >= today) {
        clicksToday = clickStats.clicks_today;
      }
      
      if (clickStats.last_click_at && new Date(clickStats.last_click_at) >= startOfWeek) {
        clicksThisWeek = clickStats.clicks_this_week;
      }
      
      if (clickStats.last_click_at && new Date(clickStats.last_click_at) >= startOfMonth) {
        clicksThisMonth = clickStats.clicks_this_month;
      }
    }

    // === THỐNG KÊ STAKE ===
    const stakeStats = await this.userStakeRepository
      .createQueryBuilder('userStake')
      .where('userStake.wallet_id = :walletId', { walletId })
      .select([
        'userStake.status',
        'userStake.amount_staked',
        'userStake.amount_claimed'
      ])
      .getMany();

    let totalStakes = stakeStats.length;
    let activeStakes = 0;
    let completedStakes = 0;
    let cancelledStakes = 0;
    let totalAmountStaked = 0;
    let totalAmountClaimed = 0;

    stakeStats.forEach(stake => {
      if (stake.status === UserStakeStatus.ACTIVE) {
        activeStakes++;
      } else if (stake.status === UserStakeStatus.COMPLETED) {
        completedStakes++;
      } else if (stake.status === UserStakeStatus.CANCELLED) {
        cancelledStakes++;
      }

      totalAmountStaked += parseFloat(stake.amount_staked.toString());
      totalAmountClaimed += parseFloat(stake.amount_claimed?.toString() || '0');
    });

    return {
      wallet_id: wallet.id,
      sol_address: wallet.sol_address,
      referral_code: wallet.referral_code,
      wallet_type: wallet.wallet_type,
      created_at: wallet.created_at,
      
      swap_statistics: {
        total_swap_orders: totalSwapOrders,
        completed_swaps: completedSwaps,
        pending_swaps: pendingSwaps,
        failed_swaps: failedSwaps,
        total_sol_swapped: totalSolSwapped,
        total_usdt_swapped: totalUsdtSwapped,
        total_usdc_swapped: totalUsdcSwapped,
        total_mmp_received: totalMmpReceived,
        total_mpb_received: totalMpbReceived,
      },
      
      referral_statistics: {
        total_referrals: totalReferrals,
        referrals_this_month: referralsThisMonth,
        referrals_this_week: referralsThisWeek,
        total_earnings_sol: parseFloat(totalEarningsSOL?.total || '0'),
        total_earnings_mmp: parseFloat(totalEarningsMMP?.total || '0'),
        total_pending_reward_sol: parseFloat(totalPendingRewardSOL?.total || '0'),
        total_pending_reward_mmp: parseFloat(totalPendingRewardMMP?.total || '0'),
        total_wait_balance_reward_sol: parseFloat(totalWaitBalanceRewardSOL?.total || '0'),
        total_wait_balance_reward_mmp: parseFloat(totalWaitBalanceRewardMMP?.total || '0'),
        total_clicks: totalClicks,
        clicks_today: clicksToday,
        clicks_this_week: clicksThisWeek,
        clicks_this_month: clicksThisMonth,
      },
      
      stake_statistics: {
        total_stakes: totalStakes,
        active_stakes: activeStakes,
        completed_stakes: completedStakes,
        cancelled_stakes: cancelledStakes,
        total_amount_staked: totalAmountStaked,
        total_amount_claimed: totalAmountClaimed,
      }
    };
  }
}

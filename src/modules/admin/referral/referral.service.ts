import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallets/wallet.entity';
import { ReferralReward } from '../../referral-rewards/referral-reward.entity';
import { ReferralClick } from '../../referral-clicks/referral-click.entity';
import { ReferralRankingDto, ReferralRankingResponseDto } from './dto/referral-ranking.dto';
import { SearchReferralRankingDto, RankingPeriod } from './dto/search-referral-ranking.dto';
import { ReferralStatisticsDto } from './dto/referral-statistics.dto';
import { ClickStatisticsDto } from './dto/click-statistics.dto';
import { WalletClickStatisticsDto } from './dto/wallet-click-statistics.dto';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(ReferralReward)
    private referralRewardRepository: Repository<ReferralReward>,
    @InjectRepository(ReferralClick)
    private referralClickRepository: Repository<ReferralClick>,
  ) {}

  async getReferralRanking(searchDto: SearchReferralRankingDto): Promise<ReferralRankingResponseDto> {
    const { period = RankingPeriod.ALL_TIME, page = 1, limit = 10, search } = searchDto;
    const skip = (page - 1) * limit;

    // Lấy danh sách TẤT CẢ ví có mã giới thiệu để tính xếp hạng chính xác
    const allWalletsWithReferralCode = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('wallet.referral_code IS NOT NULL')
      .getMany();

    const allRankingData: ReferralRankingDto[] = [];

    // Tính toán dữ liệu cho TẤT CẢ ví
    for (const wallet of allWalletsWithReferralCode) {
      // Đếm tổng số giới thiệu
      const totalReferrals = await this.walletRepository
        .createQueryBuilder('wallet')
        .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
        .getCount();

      // Đếm giới thiệu tháng này
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const referralsThisMonth = await this.walletRepository
        .createQueryBuilder('wallet')
        .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
        .andWhere('wallet.created_at >= :startOfMonth', { startOfMonth })
        .getCount();

      // Đếm giới thiệu tuần này
      const startOfWeek = new Date();
      const dayOfWeek = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      const referralsThisWeek = await this.walletRepository
        .createQueryBuilder('wallet')
        .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
        .andWhere('wallet.created_at >= :startOfWeek', { startOfWeek })
        .getCount();

      // Tính tổng thu nhập từ giới thiệu theo SOL và MMP
      const totalEarningsSOL = await this.referralRewardRepository
        .createQueryBuilder('reward')
        .where('reward.referrer_wallet_id = :walletId', { walletId: wallet.id })
        .andWhere('reward.status = :status', { status: 'paid' })
        .andWhere('reward.reward_token = :token', { token: 'SOL' })
        .select('SUM(reward.reward_amount)', 'total')
        .getRawOne();

      const totalEarningsMMP = await this.referralRewardRepository
        .createQueryBuilder('reward')
        .where('reward.referrer_wallet_id = :walletId', { walletId: wallet.id })
        .andWhere('reward.status = :status', { status: 'paid' })
        .andWhere('reward.reward_token = :token', { token: 'MMP' })
        .select('SUM(reward.reward_amount)', 'total')
        .getRawOne();

      allRankingData.push({
        wallet_id: wallet.id,
        sol_address: wallet.sol_address,
        referral_code: wallet.referral_code,
        total_referrals: totalReferrals,
        referrals_this_month: referralsThisMonth,
        referrals_this_week: referralsThisWeek,
        total_earnings_sol: parseFloat(totalEarningsSOL?.total || '0'),
        total_earnings_mmp: parseFloat(totalEarningsMMP?.total || '0'),
        joined_date: wallet.created_at,
      });
    }

    // Sắp xếp TẤT CẢ dữ liệu theo tiêu chí được chọn
    let sortKey: keyof ReferralRankingDto;
    switch (period) {
      case RankingPeriod.THIS_WEEK:
        sortKey = 'referrals_this_week';
        break;
      case RankingPeriod.THIS_MONTH:
        sortKey = 'referrals_this_month';
        break;
      default:
        sortKey = 'total_referrals';
        break;
    }

    allRankingData.sort((a, b) => b[sortKey] - a[sortKey]);

    // Thêm rank cho TẤT CẢ dữ liệu đã sắp xếp
    allRankingData.forEach((item, index) => {
      item.rank = index + 1;
    });

    // Lọc theo search (nếu có)
    let filteredData = allRankingData;
    if (search) {
      filteredData = allRankingData.filter(item => 
        item.sol_address.toLowerCase().includes(search.toLowerCase()) ||
        item.referral_code.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Phân trang
    const total = filteredData.length;
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      status: true,
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getReferralStatistics(): Promise<ReferralStatisticsDto> {
    // Lấy danh sách tất cả ví có mã giới thiệu
    const allWalletsWithReferralCode = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('wallet.referral_code IS NOT NULL')
      .getMany();

    let totalReferrers = 0;
    let totalReferrals = 0;
    let topReferrer = null;
    let maxReferrals = 0;

    // Tính toán cho từng referrer
    for (const wallet of allWalletsWithReferralCode) {
      // Đếm số giới thiệu của ví này
      const referralCount = await this.walletRepository
        .createQueryBuilder('wallet')
        .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
        .getCount();

      // Chỉ tính những ví đã giới thiệu ít nhất 1 người
      if (referralCount > 0) {
        totalReferrers++;
        totalReferrals += referralCount;

        // Tìm người giới thiệu xuất sắc nhất
        if (referralCount > maxReferrals) {
          maxReferrals = referralCount;
          
          // Tính thu nhập của top referrer
          const totalEarningsSOL = await this.referralRewardRepository
            .createQueryBuilder('reward')
            .where('reward.referrer_wallet_id = :walletId', { walletId: wallet.id })
            .andWhere('reward.status = :status', { status: 'paid' })
            .andWhere('reward.reward_token = :token', { token: 'SOL' })
            .select('SUM(reward.reward_amount)', 'total')
            .getRawOne();

          const totalEarningsMMP = await this.referralRewardRepository
            .createQueryBuilder('reward')
            .where('reward.referrer_wallet_id = :walletId', { walletId: wallet.id })
            .andWhere('reward.status = :status', { status: 'paid' })
            .andWhere('reward.reward_token = :token', { token: 'MMP' })
            .select('SUM(reward.reward_amount)', 'total')
            .getRawOne();

          topReferrer = {
            wallet_id: wallet.id,
            sol_address: wallet.sol_address,
            referral_code: wallet.referral_code,
            total_referrals: referralCount,
            total_earnings_sol: parseFloat(totalEarningsSOL?.total || '0'),
            total_earnings_mmp: parseFloat(totalEarningsMMP?.total || '0'),
          };
        }
      }
    }

    // Tính trung bình
    const averageReferralsPerReferrer = totalReferrers > 0 ? totalReferrals / totalReferrers : 0;

    return {
      total_referrers: totalReferrers,
      average_referrals_per_referrer: Math.round(averageReferralsPerReferrer * 100) / 100, // Làm tròn 2 chữ số thập phân
      top_referrer: topReferrer,
    };
  }

  async getClickStatistics(): Promise<ClickStatisticsDto> {
    // Lấy tổng số ví có click
    const totalWalletsWithClicks = await this.referralClickRepository.count();

    // Lấy tổng số click của tất cả ví
    const totalClicksResult = await this.referralClickRepository
      .createQueryBuilder('click')
      .select('SUM(click.total_clicks)', 'total')
      .getRawOne();
    const totalClicksAllWallets = parseInt(totalClicksResult?.total || '0');

    // Tính toán thời gian
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Chủ nhật là ngày đầu tuần
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Tính click hôm nay (real-time) - đếm tổng số click từ các wallet có click hôm nay
    const clicksTodayResult = await this.referralClickRepository
      .createQueryBuilder('click')
      .where('click.last_click_at >= :today', { today })
      .select('SUM(click.clicks_today)', 'total')
      .getRawOne();
    const clicksTodayAllWallets = parseInt(clicksTodayResult?.total || '0');

    // Tính click tuần này (real-time) - đếm tổng số click từ các wallet có click tuần này
    const clicksThisWeekResult = await this.referralClickRepository
      .createQueryBuilder('click')
      .where('click.last_click_at >= :startOfWeek', { startOfWeek })
      .select('SUM(click.clicks_this_week)', 'total')
      .getRawOne();
    const clicksThisWeekAllWallets = parseInt(clicksThisWeekResult?.total || '0');

    // Tính click tháng này (real-time) - đếm tổng số click từ các wallet có click tháng này
    const clicksThisMonthResult = await this.referralClickRepository
      .createQueryBuilder('click')
      .where('click.last_click_at >= :startOfMonth', { startOfMonth })
      .select('SUM(click.clicks_this_month)', 'total')
      .getRawOne();
    const clicksThisMonthAllWallets = parseInt(clicksThisMonthResult?.total || '0');

    // Tính trung bình click per wallet
    const averageClicksPerWallet = totalWalletsWithClicks > 0 
      ? Math.round((totalClicksAllWallets / totalWalletsWithClicks) * 100) / 100 
      : 0;

    // Tìm ví có nhiều click nhất
    const topWalletResult = await this.referralClickRepository
      .createQueryBuilder('click')
      .leftJoin('click.wallet', 'wallet')
      .select([
        'wallet.id as wallet_id',
        'wallet.sol_address as sol_address',
        'wallet.referral_code as referral_code',
        'click.total_clicks as total_clicks'
      ])
      .orderBy('click.total_clicks', 'DESC')
      .limit(1)
      .getRawOne();

    const topWallet = topWalletResult ? {
      wallet_id: topWalletResult.wallet_id,
      sol_address: topWalletResult.sol_address,
      referral_code: topWalletResult.referral_code,
      total_clicks: parseInt(topWalletResult.total_clicks)
    } : null;

    return {
      total_wallets_with_clicks: totalWalletsWithClicks,
      total_clicks_all_wallets: totalClicksAllWallets,
      average_clicks_per_wallet: averageClicksPerWallet,
      top_wallet: topWallet,
      clicks_today_all_wallets: clicksTodayAllWallets,
      clicks_this_week_all_wallets: clicksThisWeekAllWallets,
      clicks_this_month_all_wallets: clicksThisMonthAllWallets
    };
  }

  async getWalletClickStatistics(walletId: number): Promise<WalletClickStatisticsDto> {
    // Tìm wallet
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId }
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Tìm click stats của wallet
    const clickStats = await this.referralClickRepository.findOne({
      where: { wallet_id: walletId }
    });

    if (!clickStats) {
      // Trả về stats mặc định nếu chưa có
      return {
        wallet_id: wallet.id,
        sol_address: wallet.sol_address,
        referral_code: wallet.referral_code,
        total_clicks: 0,
        clicks_today: 0,
        clicks_this_week: 0,
        clicks_this_month: 0,
        last_click_at: null,
        created_at: null,
        updated_at: null
      };
    }

    // Tính toán thời gian real-time
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Chủ nhật là ngày đầu tuần
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Tính click real-time dựa trên last_click_at
    let clicksToday = 0;
    let clicksThisWeek = 0;
    let clicksThisMonth = 0;

    if (clickStats.last_click_at) {
      const lastClickDate = new Date(clickStats.last_click_at);
      
      // Kiểm tra click hôm nay
      if (lastClickDate >= today) {
        clicksToday = clickStats.clicks_today;
      }
      
      // Kiểm tra click tuần này
      if (lastClickDate >= startOfWeek) {
        clicksThisWeek = clickStats.clicks_this_week;
      }
      
      // Kiểm tra click tháng này
      if (lastClickDate >= startOfMonth) {
        clicksThisMonth = clickStats.clicks_this_month;
      }
    }

    return {
      wallet_id: wallet.id,
      sol_address: wallet.sol_address,
      referral_code: wallet.referral_code,
      total_clicks: clickStats.total_clicks,
      clicks_today: clicksToday,
      clicks_this_week: clicksThisWeek,
      clicks_this_month: clicksThisMonth,
      last_click_at: clickStats.last_click_at,
      created_at: clickStats.created_at,
      updated_at: clickStats.updated_at
    };
  }
}

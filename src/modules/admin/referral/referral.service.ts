import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallets/wallet.entity';
import { ReferralReward } from '../../referral-rewards/referral-reward.entity';
import { ReferralRankingDto, ReferralRankingResponseDto } from './dto/referral-ranking.dto';
import { SearchReferralRankingDto, RankingPeriod } from './dto/search-referral-ranking.dto';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(ReferralReward)
    private referralRewardRepository: Repository<ReferralReward>,
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
        item.sol_address.toLowerCase().includes(search.toLowerCase())
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
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenSaleRound, TokenType } from './token-sale-round.entity';
import { CreateTokenSaleRoundDto } from '../admin/token-sale-rounds/dto/create-token-sale-round.dto';
import { TokenSaleStatisticsDto, TokenSaleStatisticsSummaryDto } from './dto/token-sale-statistics.dto';

@Injectable()
export class TokenSaleRoundService {
  constructor(
    @InjectRepository(TokenSaleRound)
    private readonly tokenSaleRoundRepository: Repository<TokenSaleRound>,
  ) {}

  async findAll(): Promise<TokenSaleRound[]> {
    return this.tokenSaleRoundRepository.find({
      order: {
        created_at: 'DESC'
      }
    });
  }

  /**
   * Lấy thống kê token sale cho một round cụ thể
   */
  async getTokenSaleStatistics(roundId: number): Promise<TokenSaleStatisticsDto> {
    const round = await this.tokenSaleRoundRepository.findOne({
      where: { id: roundId }
    });

    if (!round) {
      throw new BadRequestException(`Token sale round with ID ${roundId} not found`);
    }

    // Thống kê từ swap orders trong khoảng thời gian của round, chỉ theo loại token của round
    const swapOrderStats = await this.tokenSaleRoundRepository.query(`
      SELECT 
        SUM(CASE WHEN output_token = $1 AND status = 'completed' THEN 
          CASE 
            WHEN output_token = 'MMP' THEN mmp_received 
            WHEN output_token = 'MPB' THEN mpb_received 
            ELSE 0 
          END
        ELSE 0 END) as total_token_sold,
        COUNT(CASE WHEN output_token = $1 AND status = 'completed' THEN 1 END) as total_swap_orders
      FROM swap_orders 
      WHERE created_at >= $2 AND created_at <= $3
    `, [round.coin, round.time_start, round.time_end]);

    // Thống kê từ referral rewards trong khoảng thời gian của round, chỉ theo loại token của round
    const referralRewardStats = await this.tokenSaleRoundRepository.query(`
      SELECT 
        SUM(CASE WHEN reward_token = $1 AND status = 'paid' THEN reward_amount ELSE 0 END) as total_token_referral_rewards,
        COUNT(CASE WHEN reward_token = $1 AND status = 'paid' THEN 1 END) as total_referral_rewards
      FROM referral_rewards 
      WHERE created_at >= $2 AND created_at <= $3
    `, [round.coin, round.time_start, round.time_end]);

    const totalTokenSold = parseFloat(swapOrderStats[0]?.total_token_sold || '0');
    const totalTokenReferralRewards = parseFloat(referralRewardStats[0]?.total_token_referral_rewards || '0');
    const totalSwapOrders = parseInt(swapOrderStats[0]?.total_swap_orders || '0');
    const totalReferralRewards = parseInt(referralRewardStats[0]?.total_referral_rewards || '0');

    // Tính tổng lưu hành (swap + referral)
    const totalTokenCirculation = totalTokenSold + totalTokenReferralRewards;

    // Tính phần trăm hoàn thành
    const roundQuantity = parseFloat(round.quantity);
    const completionPercentage = roundQuantity > 0 ? (totalTokenCirculation / roundQuantity) * 100 : 0;

    // Tạo response dựa trên loại token của round
    const response: TokenSaleStatisticsDto = {
      round_id: round.id,
      round_name: round.round_name,
      coin: round.coin,
      quantity: round.quantity,
      time_start: round.time_start,
      time_end: round.time_end,
      status: round.status,
      mmp_sold_from_swap: round.coin === TokenType.MMP ? totalTokenSold : 0,
      mpb_sold_from_swap: round.coin === TokenType.MPB ? totalTokenSold : 0,
      total_swap_orders: totalSwapOrders,
      mmp_given_as_referral: round.coin === TokenType.MMP ? totalTokenReferralRewards : 0,
      mpb_given_as_referral: round.coin === TokenType.MPB ? totalTokenReferralRewards : 0,
      total_referral_rewards: totalReferralRewards,
      total_mmp_circulation: round.coin === TokenType.MMP ? totalTokenCirculation : 0,
      total_mpb_circulation: round.coin === TokenType.MPB ? totalTokenCirculation : 0,
      mmp_completion_percentage: round.coin === TokenType.MMP ? completionPercentage : 0,
      mpb_completion_percentage: round.coin === TokenType.MPB ? completionPercentage : 0,
      last_updated: new Date()
    };

    return response;
  }
}

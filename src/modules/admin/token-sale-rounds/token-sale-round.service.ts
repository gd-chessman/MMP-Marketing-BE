import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenSaleRound } from '../../token-sale-rounds/token-sale-round.entity';
import { CreateTokenSaleRoundDto } from './dto/create-token-sale-round.dto';
import { TokenSaleStatisticsDto, TokenSaleStatisticsSummaryDto } from 'src/modules/token-sale-rounds/dto/token-sale-statistics.dto';
import { TokenType } from '../../token-sale-rounds/token-sale-round.entity';
import { Status } from '../../token-sale-rounds/token-sale-round.entity';
import { SearchTokenSaleRoundsDto } from './dto/search-token-sale-rounds.dto';

@Injectable()
export class TokenSaleRoundService {
  constructor(
    @InjectRepository(TokenSaleRound)
    private readonly tokenSaleRoundRepository: Repository<TokenSaleRound>,
  ) {}

  async create(createTokenSaleRoundDto: CreateTokenSaleRoundDto): Promise<TokenSaleRound> {
    // Kiểm tra xem có round nào khác của cùng coin type đang diễn ra trong thời gian này không
    const existingRounds = await this.tokenSaleRoundRepository.find({
      where: { coin: createTokenSaleRoundDto.coin }
    });

    const newStartTime = new Date(createTokenSaleRoundDto.time_start);
    const newEndTime = new Date(createTokenSaleRoundDto.time_end);

    // Kiểm tra xem thời gian bắt đầu mới có nằm trong giai đoạn của round cũ nào không
    for (const existingRound of existingRounds) {
      const existingStartTime = new Date(existingRound.time_start);
      const existingEndTime = new Date(existingRound.time_end);

      // Kiểm tra xem thời gian bắt đầu mới có nằm trong khoảng thời gian của round cũ không
      if (newStartTime >= existingStartTime && newStartTime <= existingEndTime) {
        throw new BadRequestException(
          `New round start time (${newStartTime.toISOString()}) overlaps with existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
        );
      }

      // Kiểm tra xem thời gian kết thúc mới có nằm trong khoảng thời gian của round cũ không
      if (newEndTime >= existingStartTime && newEndTime <= existingEndTime) {
        throw new BadRequestException(
          `New round end time (${newEndTime.toISOString()}) overlaps with existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
        );
      }

      // Kiểm tra xem round mới có bao trùm hoàn toàn round cũ không
      if (newStartTime <= existingStartTime && newEndTime >= existingEndTime) {
        throw new BadRequestException(
          `New round completely overlaps existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
        );
      }
    }

    const tokenSaleRound = this.tokenSaleRoundRepository.create({
      round_name: createTokenSaleRoundDto.round_name,
      quantity: createTokenSaleRoundDto.quantity.toString(),
      coin: createTokenSaleRoundDto.coin,
      time_start: newStartTime,
      time_end: newEndTime,
    });

    return this.tokenSaleRoundRepository.save(tokenSaleRound);
  }

  async findAll(searchDto: SearchTokenSaleRoundsDto) {
    const { page = 1, limit = 10, search } = searchDto;
    const skip = (page - 1) * limit;
    
    let queryBuilder = this.tokenSaleRoundRepository
      .createQueryBuilder('tokenSaleRound');

    if (search) {
      queryBuilder = queryBuilder.where(
        '(tokenSaleRound.round_name ILIKE :search OR ' +
        'CAST(tokenSaleRound.coin AS TEXT) ILIKE :search OR ' +
        'CAST(tokenSaleRound.quantity AS TEXT) ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [tokenSaleRounds, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('tokenSaleRound.created_at', 'DESC')
      .getManyAndCount();

    return {
      status: true,
      data: tokenSaleRounds,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
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

  /**
   * Lấy thống kê token sale cho tất cả rounds theo status
   */
  async getTokenSaleStatisticsByStatus(status?: Status): Promise<{ rounds: TokenSaleStatisticsDto[], summary: TokenSaleStatisticsSummaryDto }> {
    // Lấy tất cả rounds
    const allRounds = await this.tokenSaleRoundRepository.find({
      order: {
        created_at: 'DESC'
      }
    });

    // Lọc rounds theo status nếu có, nếu không thì lấy tất cả
    const filteredRounds = status ? allRounds.filter(round => round.status === status) : allRounds;

    if (filteredRounds.length === 0) {
      return {
        rounds: [],
        summary: {
          total_rounds: 0,
          active_rounds: 0,
          completed_rounds: 0,
          total_mmp_sold_all_rounds: 0,
          total_mpb_sold_all_rounds: 0,
          total_mmp_referral_rewards_all_rounds: 0,
          total_mpb_referral_rewards_all_rounds: 0,
          total_mmp_net_sold_all_rounds: 0,
          total_mpb_net_sold_all_rounds: 0,
          total_swap_orders_all_rounds: 0,
          total_referral_rewards_all_rounds: 0,
          last_updated: new Date()
        }
      };
    }

    // Lấy thống kê cho từng round
    const roundsStatistics: TokenSaleStatisticsDto[] = [];
    let totalMmpSold = 0;
    let totalMpbSold = 0;
    let totalMmpReferralRewards = 0;
    let totalMpbReferralRewards = 0;
    let totalSwapOrders = 0;
    let totalReferralRewards = 0;
    let activeRounds = 0;
    let completedRounds = 0;

    for (const round of filteredRounds) {
      const roundStats = await this.getTokenSaleStatistics(round.id);
      roundsStatistics.push(roundStats);

      // Cộng dồn thống kê
      totalMmpSold += roundStats.mmp_sold_from_swap;
      totalMpbSold += roundStats.mpb_sold_from_swap;
      totalMmpReferralRewards += roundStats.mmp_given_as_referral;
      totalMpbReferralRewards += roundStats.mpb_given_as_referral;
      totalSwapOrders += roundStats.total_swap_orders;
      totalReferralRewards += roundStats.total_referral_rewards;

      // Đếm số rounds theo status
      if (round.status === Status.ONGOING) {
        activeRounds++;
      } else if (round.status === Status.ENDED) {
        completedRounds++;
      }
    }

    // Tạo summary
    const summary: TokenSaleStatisticsSummaryDto = {
      total_rounds: filteredRounds.length,
      active_rounds: activeRounds,
      completed_rounds: completedRounds,
      total_mmp_sold_all_rounds: totalMmpSold,
      total_mpb_sold_all_rounds: totalMpbSold,
      total_mmp_referral_rewards_all_rounds: totalMmpReferralRewards,
      total_mpb_referral_rewards_all_rounds: totalMpbReferralRewards,
      total_mmp_net_sold_all_rounds: totalMmpSold + totalMmpReferralRewards,
      total_mpb_net_sold_all_rounds: totalMpbSold + totalMpbReferralRewards,
      total_swap_orders_all_rounds: totalSwapOrders,
      total_referral_rewards_all_rounds: totalReferralRewards,
      last_updated: new Date()
    };

    return {
      rounds: roundsStatistics,
      summary
    };
  }
}

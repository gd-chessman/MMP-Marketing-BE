import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenSaleRound } from '../../token-sale-rounds/token-sale-round.entity';
import { CreateTokenSaleRoundDto } from './dto/create-token-sale-round.dto';
import { UpdateTokenSaleRoundDto } from './dto/update-token-sale-round.dto';
import { TokenSaleStatisticsDto, TokenSaleStatisticsSummaryDto } from 'src/modules/token-sale-rounds/dto/token-sale-statistics.dto';
import { TokenSaleOverviewDto } from './dto/token-sale-overview.dto';
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

  async update(id: number, updateTokenSaleRoundDto: UpdateTokenSaleRoundDto): Promise<TokenSaleRound> {
    const tokenSaleRound = await this.tokenSaleRoundRepository.findOne({ where: { id } });
    
    if (!tokenSaleRound) {
      throw new NotFoundException(`Token sale round with ID ${id} not found`);
    }

    // Kiểm tra overlap nếu có thay đổi thời gian
    if (updateTokenSaleRoundDto.time_start || updateTokenSaleRoundDto.time_end) {
      const newStartTime = updateTokenSaleRoundDto.time_start ? new Date(updateTokenSaleRoundDto.time_start) : new Date(tokenSaleRound.time_start);
      const newEndTime = updateTokenSaleRoundDto.time_end ? new Date(updateTokenSaleRoundDto.time_end) : new Date(tokenSaleRound.time_end);
      const coinType = updateTokenSaleRoundDto.coin || tokenSaleRound.coin;

      // Lấy tất cả rounds khác cùng coin type (trừ round hiện tại)
      const existingRounds = await this.tokenSaleRoundRepository.find({
        where: { coin: coinType }
      });

      for (const existingRound of existingRounds) {
        if (existingRound.id === id) continue; // Bỏ qua round hiện tại

        const existingStartTime = new Date(existingRound.time_start);
        const existingEndTime = new Date(existingRound.time_end);

        // Kiểm tra overlap
        if (newStartTime >= existingStartTime && newStartTime <= existingEndTime) {
          throw new BadRequestException(
            `Updated round start time (${newStartTime.toISOString()}) overlaps with existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
          );
        }

        if (newEndTime >= existingStartTime && newEndTime <= existingEndTime) {
          throw new BadRequestException(
            `Updated round end time (${newEndTime.toISOString()}) overlaps with existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
          );
        }

        if (newStartTime <= existingStartTime && newEndTime >= existingEndTime) {
          throw new BadRequestException(
            `Updated round completely overlaps existing round "${existingRound.round_name}" (${existingStartTime.toISOString()} - ${existingEndTime.toISOString()})`
          );
        }
      }
    }

    // Cập nhật các trường
    if (updateTokenSaleRoundDto.round_name !== undefined) {
      tokenSaleRound.round_name = updateTokenSaleRoundDto.round_name;
    }
    
    if (updateTokenSaleRoundDto.quantity !== undefined) {
      tokenSaleRound.quantity = updateTokenSaleRoundDto.quantity.toString();
    }
    
    if (updateTokenSaleRoundDto.coin !== undefined) {
      tokenSaleRound.coin = updateTokenSaleRoundDto.coin;
    }
    
    if (updateTokenSaleRoundDto.time_start !== undefined) {
      tokenSaleRound.time_start = new Date(updateTokenSaleRoundDto.time_start);
    }
    
    if (updateTokenSaleRoundDto.time_end !== undefined) {
      tokenSaleRound.time_end = new Date(updateTokenSaleRoundDto.time_end);
    }

    return this.tokenSaleRoundRepository.save(tokenSaleRound);
  }



  async remove(id: number): Promise<void> {
    const tokenSaleRound = await this.tokenSaleRoundRepository.findOne({ where: { id } });
    await this.tokenSaleRoundRepository.remove(tokenSaleRound);
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
   * Lấy thống kê tổng quan token sale cho tất cả rounds
   */
  async getTokenSaleStatisticsByStatus(): Promise<TokenSaleOverviewDto> {
    // Lấy tất cả rounds
    const allRounds = await this.tokenSaleRoundRepository.find({
      order: {
        created_at: 'DESC'
      }
    });

    if (allRounds.length === 0) {
      return {
        total_rounds: 0,
        total_mmp_sold_all_rounds: 0,
        total_mpb_sold_all_rounds: 0,
        total_mmp_referral_rewards_all_rounds: 0,
        total_mpb_referral_rewards_all_rounds: 0,
        total_mmp_net_sold_all_rounds: 0,
        total_mpb_net_sold_all_rounds: 0,
        total_swap_orders_all_rounds: 0,
        total_referral_rewards_all_rounds: 0,
        last_updated: new Date()
      };
    }

    let totalMmpSold = 0;
    let totalMpbSold = 0;
    let totalMmpReferralRewards = 0;
    let totalMpbReferralRewards = 0;
    let totalSwapOrders = 0;
    let totalReferralRewards = 0;

    // Tính tổng thống kê từ tất cả rounds
    for (const round of allRounds) {
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
      const totalSwapOrdersForRound = parseInt(swapOrderStats[0]?.total_swap_orders || '0');
      const totalReferralRewardsForRound = parseInt(referralRewardStats[0]?.total_referral_rewards || '0');

      // Cộng dồn thống kê theo loại token của round
      if (round.coin === TokenType.MMP) {
        totalMmpSold += totalTokenSold;
        totalMmpReferralRewards += totalTokenReferralRewards;
      } else if (round.coin === TokenType.MPB) {
        totalMpbSold += totalTokenSold;
        totalMpbReferralRewards += totalTokenReferralRewards;
      }

      totalSwapOrders += totalSwapOrdersForRound;
      totalReferralRewards += totalReferralRewardsForRound;
    }

    // Tạo response tổng quan
    const overview: TokenSaleOverviewDto = {
      total_rounds: allRounds.length,
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

    return overview;
  }
}

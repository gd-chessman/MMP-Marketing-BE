import { Status } from '../token-sale-round.entity';

export class TokenSaleStatisticsDto {
  round_id: number;
  round_name: string;
  coin: string;
  quantity: string;
  time_start: Date;
  time_end: Date;
  status: Status;
  
  // Thống kê từ swap orders
  mmp_sold_from_swap: number;
  mpb_sold_from_swap: number;
  total_swap_orders: number;
  
  // Thống kê từ referral rewards
  mmp_given_as_referral: number;
  mpb_given_as_referral: number;
  total_referral_rewards: number;
  
  // Tổng hợp
  total_mmp_circulation: number; // Tổng MMP đã lưu hành (swap + referral)
  total_mpb_circulation: number; // Tổng MPB đã lưu hành (swap + referral)
  
  // Phần trăm hoàn thành
  mmp_completion_percentage: number;
  mpb_completion_percentage: number;
  
  last_updated: Date;
}

export class TokenSaleStatisticsSummaryDto {
  total_rounds: number;
  active_rounds: number;
  completed_rounds: number;
  total_mmp_sold_all_rounds: number;
  total_mpb_sold_all_rounds: number;
  total_mmp_referral_rewards_all_rounds: number;
  total_mpb_referral_rewards_all_rounds: number;
  total_mmp_net_sold_all_rounds: number;
  total_mpb_net_sold_all_rounds: number;
  total_swap_orders_all_rounds: number;
  total_referral_rewards_all_rounds: number;
  last_updated: Date;
} 
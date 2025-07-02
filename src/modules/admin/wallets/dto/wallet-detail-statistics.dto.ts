export class WalletDetailStatisticsDto {
  wallet_id: number;
  sol_address: string;
  referral_code: string;
  wallet_type: string;
  created_at: Date;

  // Thống kê Swap
  swap_statistics: {
    total_swap_orders: number;
    completed_swaps: number;
    pending_swaps: number;
    failed_swaps: number;
    total_sol_swapped: number;
    total_usdt_swapped: number;
    total_usdc_swapped: number;
    total_mmp_received: number;
    total_mpb_received: number;
  };

  // Thống kê Referral
  referral_statistics: {
    total_referrals: number;
    referrals_this_month: number;
    referrals_this_week: number;
    total_earnings_sol: number;
    total_earnings_mmp: number;
    total_pending_reward_sol: number;
    total_pending_reward_mmp: number;
    total_wait_balance_reward_sol: number;
    total_wait_balance_reward_mmp: number;
    total_clicks: number;
    clicks_today: number;
    clicks_this_week: number;
    clicks_this_month: number;
  };

  // Thống kê Stake
  stake_statistics: {
    total_stakes: number;
    active_stakes: number;
    completed_stakes: number;
    cancelled_stakes: number;
    total_amount_staked: number;
    total_amount_claimed: number;
  };
} 
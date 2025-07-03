export class ReferralStatisticsDto {
  total_referrers: number;
  average_referrals_per_referrer: number;
  total_reward_sol: number;
  total_reward_mmp: number;
  total_reward_mmp_usd: number;
  top_referrer: {
    wallet_id: number;
    sol_address: string;
    referral_code: string;
    total_referrals: number;
    total_earnings_sol: number;
    total_earnings_mmp: number;
    total_earnings_mmp_usd: number;
  };
}

export class WalletReferralStatisticsDto {
  wallet_id: number;
  sol_address: string;
  referral_code: string;
  wallet_type: string;
  created_at: Date;
  
  // Thống kê giới thiệu
  total_referrals: number;
  referrals_this_month: number;
  referrals_this_week: number;
  
  // Thống kê thu nhập đã thanh toán
  total_earnings_sol: number;
  total_earnings_mmp: number;
  total_earnings_mmp_usd: number;
  
  // Thống kê thu nhập đang chờ
  total_pending_reward_sol: number;
  total_pending_reward_mmp: number;
  total_wait_balance_reward_sol: number;
  total_wait_balance_reward_mmp: number;
  
  // Thống kê click
  total_clicks: number;
  clicks_today: number;
  clicks_this_week: number;
  clicks_this_month: number;
  last_click_at: Date | null;
  
  // Thông tin người giới thiệu (nếu có)
  referred_by_info?: {
    wallet_id: number;
    sol_address: string;
    referral_code: string;
  };
}

export class ReferredWalletDto {
  wallet_id: number;
  sol_address: string;
  created_at: Date;
  total_reward_sol: number;
  total_reward_mmp: number;
  total_reward_mmp_usd: number;
  pending_reward_sol: number;
  pending_reward_mmp: number;
  pending_reward_mmp_usd: number;
  wait_balance_reward_sol: number;
  wait_balance_reward_mmp: number;
  wait_balance_reward_mmp_usd: number;
}

export class ReferredWalletsResponseDto {
  status: boolean;
  data: ReferredWalletDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class ReferralRewardHistoryDto {
  id: number;
  reward_amount: number;
  reward_token: string;
  status: string;
  tx_hash: string | null;
  created_at: Date;
  referred_wallet: {
    wallet_id: number;
    sol_address: string;
  };
  swap_order: null;
}

export class ReferralRewardHistoryResponseDto {
  status: boolean;
  data: ReferralRewardHistoryDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} 
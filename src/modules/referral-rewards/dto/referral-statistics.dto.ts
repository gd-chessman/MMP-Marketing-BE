export class ReferredWalletDto {
  wallet_id: number;
  sol_address: string;
  created_at: Date;
  total_reward_sol: number;
  total_reward_mmp: number;
  total_reward_mpb: number;
  pending_reward_sol: number;
  pending_reward_mmp: number;
  wait_balance_reward_sol: number;
  wait_balance_reward_mmp: number;
}

export class ReferralStatisticsDto {
  total_referrals: number;
  total_reward_sol: number;
  total_reward_mmp: number;
  total_reward_mpb: number;
  total_pending_reward_sol: number;
  total_pending_reward_mmp: number;
  total_wait_balance_reward_sol: number;
  total_wait_balance_reward_mmp: number;
  referred_wallets: ReferredWalletDto[];
} 
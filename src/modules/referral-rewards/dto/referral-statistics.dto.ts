export class ReferredWalletDto {
  wallet_id: number;
  sol_address: string;
  created_at: Date;
  total_reward_sol: number;
  total_reward_mmp: number;
  total_reward_mpb: number;
}

export class ReferralStatisticsDto {
  total_referrals: number;
  total_reward_sol: number;
  total_reward_mmp: number;
  total_reward_mpb: number;
  referred_wallets: ReferredWalletDto[];
} 
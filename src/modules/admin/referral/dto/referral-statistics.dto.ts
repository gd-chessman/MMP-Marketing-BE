export class ReferralStatisticsDto {
  total_referrers: number;
  average_referrals_per_referrer: number;
  top_referrer: {
    wallet_id: number;
    sol_address: string;
    referral_code: string;
    total_referrals: number;
    total_earnings_sol: number;
    total_earnings_mmp: number;
  };
} 
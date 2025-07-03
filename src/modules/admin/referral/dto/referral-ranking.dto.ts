export class ReferralRankingDto {
  wallet_id: number;
  sol_address: string;
  referral_code: string;
  total_referrals: number;
  referrals_this_month: number;
  referrals_this_week: number;
  total_earnings_sol: number;
  total_earnings_mmp: number;
  total_earnings_mmp_usd: number;
  joined_date: Date;
  rank?: number;
}

export class ReferralRankingResponseDto {
  status: boolean;
  data: ReferralRankingDto[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} 
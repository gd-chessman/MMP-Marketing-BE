export class ReferralStatisticsDto {
  wallet_id: number;
  sol_address: string;
  referral_code: string;
  total_referred_wallets: number;
  referred_by_info?: {
    wallet_id: number;
    sol_address: string;
    referral_code: string;
    user_telegram_id?: string;
    user_email?: string;
  };
  referred_wallets: Array<{
    id: number;
    sol_address: string;
    created_at: Date;
    user_telegram_id?: string;
    user_email?: string;
  }>;
} 
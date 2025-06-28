export class WalletClickStatisticsDto {
  wallet_id: number;
  sol_address: string;
  referral_code: string;
  total_clicks: number;
  clicks_today: number;
  clicks_this_week: number;
  clicks_this_month: number;
  last_click_at: Date;
  created_at: Date;
  updated_at: Date;
} 
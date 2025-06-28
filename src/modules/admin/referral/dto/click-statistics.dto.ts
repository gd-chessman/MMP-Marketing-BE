export class ClickStatisticsDto {
  total_wallets_with_clicks: number;
  total_clicks_all_wallets: number;
  average_clicks_per_wallet: number;
  top_wallet: {
    wallet_id: number;
    sol_address: string;
    referral_code: string;
    total_clicks: number;
  };
  clicks_today_all_wallets: number;
  clicks_this_week_all_wallets: number;
  clicks_this_month_all_wallets: number;
} 
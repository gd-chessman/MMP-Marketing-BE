export class WalletResponseDto {
  id: number;
  user_id: number;
  sol_address: string;
  referral_code: string;
  wallet_type: string;
  referred_by: string;
  created_at: Date;
  user: {
    id: number;
    full_name: string;
    email: string;
    is_verified_email: boolean;
    is_verified_gg_auth: boolean;
    telegram_id: string;
    created_at: Date;
  };
  swap_statistics: {
    total_mmp_received: number;
    total_mpb_received: number;
  };
}

export class WalletListResponseDto {
  status: boolean;
  data: WalletResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} 
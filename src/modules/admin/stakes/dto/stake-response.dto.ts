export class StakeResponseDto {
  id: number;
  wallet_id: number;
  wallet_address: string;
  staking_plan_id: number;
  staking_plan_name: string;
  staking_plan_interest_rate: number;
  staking_plan_period_days: number;
  stake_id: number;
  stake_account_pda: string;
  staking_tx_signature: string;
  unstaking_tx_signature: string;
  amount_staked: number;
  amount_claimed: number;
  start_date: Date;
  end_date: Date;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export class StakeListResponseDto {
  status: boolean;
  data: StakeResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} 
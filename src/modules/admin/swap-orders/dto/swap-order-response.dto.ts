export class SwapOrderResponseDto {
  id: number;
  wallet_id: number;
  wallet_address: string;
  input_token: string;
  output_token: string;
  input_amount: number;
  mmp_received: number;
  mpb_received: number;
  swap_rate: number;
  status: string;
  tx_hash_send: string;
  tx_hash_ref: string;
  created_at: Date;
}

export class SwapOrderListResponseDto {
  status: boolean;
  data: SwapOrderResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} 
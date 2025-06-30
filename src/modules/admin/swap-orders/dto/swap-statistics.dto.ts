export class SwapStatisticsDto {
  // Tổng số swap orders
  total_swap_orders: number;

  // Số lượng theo trạng thái
  pending_orders: number;
  completed_orders: number;
  failed_orders: number;

  // Tổng khối lượng swap theo token
  total_sol_swapped: number;
  total_usdt_swapped: number;
  total_usdc_swapped: number;

  // Tổng token nhận được
  total_mmp_received: number;
  total_mpb_received: number;
} 
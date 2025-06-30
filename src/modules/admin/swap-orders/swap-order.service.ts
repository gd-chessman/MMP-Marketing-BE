import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SwapOrder, SwapOrderStatus, TokenType } from '../../swap-orders/swap-order.entity';
import { Wallet } from '../../wallets/wallet.entity';
import { SearchSwapOrdersDto } from './dto/search-swap-orders.dto';
import { SwapOrderListResponseDto, SwapOrderResponseDto } from './dto/swap-order-response.dto';
import { SwapStatisticsDto } from './dto/swap-statistics.dto';

@Injectable()
export class SwapOrderService {
  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  async getStatistics(): Promise<SwapStatisticsDto> {
    // Tổng số swap orders
    const totalSwapOrders = await this.swapOrderRepository.count();

    // Số lượng theo trạng thái
    const pendingOrders = await this.swapOrderRepository.count({
      where: { status: SwapOrderStatus.PENDING }
    });
    const completedOrders = await this.swapOrderRepository.count({
      where: { status: SwapOrderStatus.COMPLETED }
    });
    const failedOrders = await this.swapOrderRepository.count({
      where: { status: SwapOrderStatus.FAILED }
    });

    // Tổng khối lượng swap theo token (chỉ tính completed orders)
    const solStats = await this.swapOrderRepository
      .createQueryBuilder('swap_order')
      .select('SUM(swap_order.input_amount)', 'total')
      .where('swap_order.input_token = :token', { token: TokenType.SOL })
      .andWhere('swap_order.status = :status', { status: SwapOrderStatus.COMPLETED })
      .getRawOne();

    const usdtStats = await this.swapOrderRepository
      .createQueryBuilder('swap_order')
      .select('SUM(swap_order.input_amount)', 'total')
      .where('swap_order.input_token = :token', { token: TokenType.USDT })
      .andWhere('swap_order.status = :status', { status: SwapOrderStatus.COMPLETED })
      .getRawOne();

    const usdcStats = await this.swapOrderRepository
      .createQueryBuilder('swap_order')
      .select('SUM(swap_order.input_amount)', 'total')
      .where('swap_order.input_token = :token', { token: TokenType.USDC })
      .andWhere('swap_order.status = :status', { status: SwapOrderStatus.COMPLETED })
      .getRawOne();

    // Tổng token nhận được
    const mmpStats = await this.swapOrderRepository
      .createQueryBuilder('swap_order')
      .select('SUM(swap_order.mmp_received)', 'total')
      .where('swap_order.status = :status', { status: SwapOrderStatus.COMPLETED })
      .andWhere('swap_order.mmp_received IS NOT NULL')
      .getRawOne();

    const mpbStats = await this.swapOrderRepository
      .createQueryBuilder('swap_order')
      .select('SUM(swap_order.mpb_received)', 'total')
      .where('swap_order.status = :status', { status: SwapOrderStatus.COMPLETED })
      .andWhere('swap_order.mpb_received IS NOT NULL')
      .getRawOne();

    return {
      total_swap_orders: totalSwapOrders,
      pending_orders: pendingOrders,
      completed_orders: completedOrders,
      failed_orders: failedOrders,
      total_sol_swapped: parseFloat(solStats?.total || '0'),
      total_usdt_swapped: parseFloat(usdtStats?.total || '0'),
      total_usdc_swapped: parseFloat(usdcStats?.total || '0'),
      total_mmp_received: parseFloat(mmpStats?.total || '0'),
      total_mpb_received: parseFloat(mpbStats?.total || '0')
    };
  }

  async getSwapOrderHistory(searchDto: SearchSwapOrdersDto): Promise<SwapOrderListResponseDto> {
    const { search, status, input_token, output_token, page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.swapOrderRepository
      .createQueryBuilder('swap_order')
      .leftJoin('swap_order.wallet', 'wallet')
      .select([
        'swap_order.id',
        'swap_order.wallet_id',
        'swap_order.input_token',
        'swap_order.output_token',
        'swap_order.input_amount',
        'swap_order.mmp_received',
        'swap_order.mpb_received',
        'swap_order.swap_rate',
        'swap_order.status',
        'swap_order.tx_hash_send',
        'swap_order.tx_hash_ref',
        'swap_order.created_at',
        'wallet.sol_address'
      ]);

    // Add search filter
    if (search) {
      queryBuilder.andWhere(
        '(wallet.sol_address LIKE :search OR swap_order.tx_hash_send LIKE :search OR swap_order.tx_hash_ref LIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Add status filter
    if (status) {
      queryBuilder.andWhere('swap_order.status = :status', { status });
    }

    // Add input token filter
    if (input_token) {
      queryBuilder.andWhere('swap_order.input_token = :input_token', { input_token });
    }

    // Add output token filter
    if (output_token) {
      queryBuilder.andWhere('swap_order.output_token = :output_token', { output_token });
    }

    // Add ordering
    queryBuilder.orderBy('swap_order.created_at', 'DESC');

    // Add pagination
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    // Transform data
    const transformedData: SwapOrderResponseDto[] = data.map(item => ({
      id: item.id,
      wallet_id: item.wallet_id,
      wallet_address: item.wallet?.sol_address || '',
      input_token: item.input_token,
      output_token: item.output_token,
      input_amount: parseFloat(item.input_amount.toString()),
      mmp_received: parseFloat(item.mmp_received?.toString() || '0'),
      mpb_received: parseFloat(item.mpb_received?.toString() || '0'),
      swap_rate: parseFloat(item.swap_rate.toString()),
      status: item.status,
      tx_hash_send: item.tx_hash_send || '',
      tx_hash_ref: item.tx_hash_ref || '',
      created_at: item.created_at
    }));

    return {
      status: true,
      data: transformedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

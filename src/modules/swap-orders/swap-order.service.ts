import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SwapOrder } from './swap-order.entity';

@Injectable()
export class SwapOrderService {
  constructor(
    @InjectRepository(SwapOrder)
    private swapOrderRepository: Repository<SwapOrder>,
  ) {}

  async findByWalletId(walletId: number): Promise<SwapOrder[]> {
    return this.swapOrderRepository.find({
      where: { wallet_id: walletId },
      order: { created_at: 'DESC' }
    });
  }

  // Các phương thức sẽ được thêm sau
} 
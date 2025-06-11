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

  // Các phương thức sẽ được thêm sau
} 
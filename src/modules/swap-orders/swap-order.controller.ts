import { Controller } from '@nestjs/common';
import { SwapOrderService } from './swap-order.service';

@Controller('swap-orders')
export class SwapOrderController {
  constructor(private readonly swapOrderService: SwapOrderService) {}

  // Các route sẽ được thêm sau
} 
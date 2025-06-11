import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { SwapOrderService } from './swap-order.service';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';


@Controller('swap-orders')
export class SwapOrderController {
  constructor(private readonly swapOrderService: SwapOrderService) {}

  @UseGuards(JwtGuestGuard)
  @Get()
  async getMySwapOrders(@Req() req) {
    return this.swapOrderService.findByWalletId(req.user.wallet.id);
  }

  // Các route sẽ được thêm sau
} 
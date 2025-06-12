import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';
import { SwapOrderService } from './swap-order.service';
import { SwapOrder, SwapOrderStatus } from './swap-order.entity';
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';

@Controller('swap-orders')
export class SwapOrderController {
  constructor(private readonly swapOrderService: SwapOrderService) {}

  @UseGuards(JwtGuestGuard)
  @Post()
  async createSwapOrder(
    @Body() dto: CreateSwapOrderDto,
    @Req() req: any
  ): Promise<SwapOrder> {
    return this.swapOrderService.create(req.user.wallet, dto);
  }

  @UseGuards(JwtGuestGuard)
  @Get()
  async getMySwapOrders(@Req() req: any): Promise<SwapOrder[]> {
    return this.swapOrderService.findByWalletId(req.user.wallet.id);
  }
  
} 
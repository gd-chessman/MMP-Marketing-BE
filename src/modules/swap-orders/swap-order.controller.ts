import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';
import { SwapOrderService } from './swap-order.service';
import { SwapOrder, SwapOrderStatus } from './swap-order.entity';
import { CreateSwapOrderDto, InitWeb3WalletDto, CompleteWeb3WalletDto } from './dto/create-swap-order.dto';

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

  @Post('web3-wallet')
  async initWeb3Wallet(@Body() dto: InitWeb3WalletDto) {
    return this.swapOrderService.initWeb3Wallet(dto);
  }

  @Post('web3-wallet/complete')
  async completeWeb3Wallet(@Body() dto: CompleteWeb3WalletDto) {
    return this.swapOrderService.completeWeb3Wallet(dto);
  }

  @Get('sol-price')
  async getSolPrice() {
    const price_usd = await this.swapOrderService.getSolPriceUSD();
    return { price_usd };
  }
} 
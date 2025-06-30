import { Controller, Get, Query, UseGuards, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { SwapOrderService } from './swap-order.service';
import { SearchSwapOrdersDto } from './dto/search-swap-orders.dto';
import { SwapOrderListResponseDto } from './dto/swap-order-response.dto';

@Controller('admin/swap-orders')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class SwapOrderController {
  constructor(private swapOrderService: SwapOrderService) {}

  @Get()
  async getSwapOrderHistory(@Query() searchDto: SearchSwapOrdersDto): Promise<SwapOrderListResponseDto> {
    return this.swapOrderService.getSwapOrderHistory(searchDto);
  }

  @Get('statistics')
  async getSwapStatistics() {
    return this.swapOrderService.getStatistics();
  }
}

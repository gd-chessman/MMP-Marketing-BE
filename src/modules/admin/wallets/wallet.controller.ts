import { Controller, Get, Post, UseGuards, Query, ClassSerializerInterceptor, UseInterceptors, Param, Body, Patch } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { WalletService } from './wallet.service';
import { UpdateWalletDto } from './dto/update-wallet.dto';

@Controller('admin/wallets')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  async getWallets(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.walletService.findAll(page, limit);
  }

  @Patch(':id/update-type')
  async updateWalletType(@Param('id') id: string, @Body() updateDto: UpdateWalletDto) {
    return this.walletService.updateWalletType(parseInt(id), updateDto.wallet_type);
  }
}

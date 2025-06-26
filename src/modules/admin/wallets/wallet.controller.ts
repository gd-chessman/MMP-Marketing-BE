import { Controller, Get, Post, UseGuards, Query, ClassSerializerInterceptor, UseInterceptors, Param, Body, Patch } from '@nestjs/common';
import { JwtAdminGuard } from '../auth/jwt-admin.guard';
import { WalletService } from './wallet.service';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { SearchWalletsDto } from './dto/search-wallets.dto';

@Controller('admin/wallets')
@UseGuards(JwtAdminGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  async getWallets(@Query() searchDto: SearchWalletsDto) {
    const { page = 1, limit = 10, search } = searchDto;
    return this.walletService.findAll(page, limit, search);
  }

  @Get('statistics')
  async getWalletStatistics() {
    return this.walletService.getStatistics();
  }

  @Get('referral-statistics/:id')
  async getReferralStatistics(@Param('id') id: string) {
    return this.walletService.getReferralStatistics(parseInt(id));
  }

  @Patch('update-type/:id')
  async updateWalletType(@Param('id') id: string, @Body() updateDto: UpdateWalletDto) {
    return this.walletService.updateWalletType(parseInt(id), updateDto.wallet_type);
  }
}

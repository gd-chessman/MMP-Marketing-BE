import { Controller, Get, Post, Put, Body, Param, UseGuards, UseInterceptors, ClassSerializerInterceptor, Request } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { Wallet } from './wallet.entity';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';

@Controller('wallets')
@UseInterceptors(ClassSerializerInterceptor)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  @UseGuards(JwtGuestGuard)
  async getMyWallet(@Request() req): Promise<Wallet> {
    return this.walletService.findOne(req.user.wallet.id);
  }
} 
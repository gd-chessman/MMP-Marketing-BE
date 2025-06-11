import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { DepositWithdrawService } from './deposit-withdraw.service';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';

@Controller('deposit-withdraws')
export class DepositWithdrawController {
  constructor(private readonly depositWithdrawService: DepositWithdrawService) {}

  @UseGuards(JwtGuestGuard)
  @Get()
  async getMyDepositWithdraws(@Req() req) {
    return this.depositWithdrawService.findByWalletId(req.user.wallet.id);
  }

  // Các route sẽ được thêm sau
} 
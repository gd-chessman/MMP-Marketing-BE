import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { DepositWithdrawService } from './deposit-withdraw.service';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';
import { CreateDepositWithdrawDto } from './dto/create-deposit-withdraw.dto';

@Controller('deposit-withdraws')
export class DepositWithdrawController {
  constructor(private readonly depositWithdrawService: DepositWithdrawService) {}

  @UseGuards(JwtGuestGuard)
  @Get()
  async getMyDepositWithdraws(@Req() req) {
    return this.depositWithdrawService.findByWalletId(req.user.wallet.id);
  }

  @UseGuards(JwtGuestGuard)
  @Post()
  async create(@Body() dto: CreateDepositWithdrawDto, @Req() req) {
    return this.depositWithdrawService.createDepositWithdraw(dto, req.user.wallet);
  }

  // Các route sẽ được thêm sau
} 
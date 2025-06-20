import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { DepositWithdrawService } from './deposit-withdraw.service';
import { JwtGuestGuard } from '../auth/jwt-guest.guard';
import { CreateDepositWithdrawDto } from './dto/create-deposit-withdraw.dto';

@Controller('deposit-withdraws')
export class DepositWithdrawController {
  constructor(private readonly depositWithdrawService: DepositWithdrawService) {}

  @UseGuards(JwtGuestGuard)
  @Post()
  async create(@Body() dto: CreateDepositWithdrawDto, @Req() req) {
    return this.depositWithdrawService.createDepositWithdraw(dto, req.user.wallet);
  }

  @UseGuards(JwtGuestGuard)
  @Get()
  async getHistory(
    @Req() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50'
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 50));
    
    return this.depositWithdrawService.findByWalletAddress(
      req.user.wallet.sol_address,
      pageNum,
      limitNum
    );
  }

  // Các route sẽ được thêm sau
} 
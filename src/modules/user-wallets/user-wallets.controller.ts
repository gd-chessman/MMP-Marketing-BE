import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { UserWalletsService } from './user-wallets.service';
import { UserWallet } from './user-wallet.entity';
import { JwtAuthUserWalletGuard } from '../auth/jwt-auth-user-wallet.guard';

@Controller('user-wallets')
export class UserWalletsController {
  constructor(private readonly userWalletsService: UserWalletsService) {}

  @Get()
  @UseGuards(JwtAuthUserWalletGuard)
  findAll(): Promise<UserWallet[]> {
    return this.userWalletsService.findAll();
  }

}
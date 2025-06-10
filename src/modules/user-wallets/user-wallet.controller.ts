import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { UserWalletService } from './user-wallet.service';
import { UserWallet } from './user-wallet.entity';
import { JwtAuthUserWalletGuard } from '../auth/jwt-auth-user-wallet.guard';

@Controller('user-wallets')
@UseInterceptors(ClassSerializerInterceptor)
export class UserWalletController {
  constructor(private readonly userWalletService: UserWalletService) {}

  @Get()
  @UseGuards(JwtAuthUserWalletGuard)
  findAll(): Promise<UserWallet[]> {
    return this.userWalletService.findAll();
  }

}
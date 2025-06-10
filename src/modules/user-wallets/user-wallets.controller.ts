import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { UserWalletsService } from './user-wallets.service';
import { CreateUserWalletDto } from './dto/create-user-wallet.dto';
import { UserWallet } from './user-wallet.entity';

@Controller('user-wallets')
export class UserWalletsController {
  constructor(private readonly userWalletsService: UserWalletsService) {}

  @Post()
  create(@Body() createUserWalletDto: CreateUserWalletDto): Promise<UserWallet> {
    return this.userWalletsService.create(createUserWalletDto);
  }

  @Get()
  findAll(): Promise<UserWallet[]> {
    return this.userWalletsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<UserWallet> {
    return this.userWalletsService.findOne(id);
  }
}
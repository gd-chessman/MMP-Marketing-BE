import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { Wallet } from './wallet.entity';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

} 
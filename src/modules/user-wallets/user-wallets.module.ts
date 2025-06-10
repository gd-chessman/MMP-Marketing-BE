import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserWalletsService } from './user-wallets.service';
import { UserWalletsController } from './user-wallets.controller';
import { UserWallet } from './user-wallet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserWallet])],
  controllers: [UserWalletsController],
  providers: [UserWalletsService],
  exports: [UserWalletsService],
})
export class UserWalletsModule {} 
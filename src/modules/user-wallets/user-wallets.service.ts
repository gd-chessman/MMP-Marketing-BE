import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserWallet } from './user-wallet.entity';
import { CreateUserWalletDto } from './dto/create-user-wallet.dto';

@Injectable()
export class UserWalletsService {
  constructor(
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
  ) {}

  async create(createUserWalletDto: CreateUserWalletDto): Promise<UserWallet> {
    const userWallet = this.userWalletRepository.create(createUserWalletDto);
    return await this.userWalletRepository.save(userWallet);
  }

  async findAll(): Promise<UserWallet[]> {
    return await this.userWalletRepository.find();
  }
} 
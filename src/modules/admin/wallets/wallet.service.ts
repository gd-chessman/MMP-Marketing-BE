import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallets/wallet.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const [wallets, total] = await this.walletRepository.findAndCount({
      relations: ['user'],
      skip,
      take: limit,
      order: { created_at: 'DESC' }
    });

    return {
      status: true,
      data: wallets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async updateWalletType(id: number, walletType: string) {
    const wallet = await this.walletRepository.findOne({ where: { id } });
    
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    wallet.wallet_type = walletType as any;
    await this.walletRepository.save(wallet);

    return {
      status: true,
      message: 'Wallet type updated successfully',
    };
  }
}

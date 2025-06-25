import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallets/wallet.entity';
import { WalletStatisticsDto } from './dto/wallet-statistics.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    
    let queryBuilder = this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoinAndSelect('wallet.user', 'user');

    if (search) {
      queryBuilder = queryBuilder.where(
        '(wallet.sol_address ILIKE :search OR ' +
        'user.telegram_id ILIKE :search OR ' +
        'user.email ILIKE :search OR ' +
        'wallet.referral_code ILIKE :search OR ' +
        'CAST(wallet.wallet_type AS TEXT) ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [wallets, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('wallet.created_at', 'DESC')
      .getManyAndCount();

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

  async getStatistics(): Promise<WalletStatisticsDto> {
    // Tổng số ví
    const totalWallets = await this.walletRepository.count();

    // Ví dùng Telegram (có telegram_id)
    const telegramWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoin('wallet.user', 'user')
      .where('user.telegram_id IS NOT NULL')
      .getCount();

    // Ví dùng Google (có email)
    const googleWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoin('wallet.user', 'user')
      .where('user.email IS NOT NULL')
      .getCount();

    // Ví Phantom (user là null)
    const phantomWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .where('wallet.user_id IS NULL')
      .getCount();

    return {
      total_wallets: totalWallets,
      telegram_wallets: telegramWallets,
      google_wallets: googleWallets,
      phantom_wallets: phantomWallets
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

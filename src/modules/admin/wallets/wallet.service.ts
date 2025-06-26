import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallets/wallet.entity';
import { WalletStatisticsDto } from './dto/wallet-statistics.dto';
import { ReferralStatisticsDto } from './dto/referral-statistics.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  async findAll(page = 1, limit = 10, search?: string, type?: string) {
    const skip = (page - 1) * limit;
    
    let queryBuilder = this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoinAndSelect('wallet.user', 'user');

    // Lọc theo type
    if (type === 'telegram') {
      // Ví có telegram_id
      queryBuilder = queryBuilder
        .where('wallet.user_id IS NOT NULL')
        .andWhere('user.telegram_id IS NOT NULL');
    } else if (type === 'google') {
      // Ví có email
      queryBuilder = queryBuilder
        .where('wallet.user_id IS NOT NULL')
        .andWhere('user.email IS NOT NULL');
    } else if (type === 'phantom') {
      // Phantom (không có user)
      queryBuilder = queryBuilder.where('wallet.user_id IS NULL');
    }

    // Lọc theo search
    if (search) {
      const searchCondition = '(wallet.sol_address ILIKE :search OR ' +
        'user.telegram_id ILIKE :search OR ' +
        'user.email ILIKE :search OR ' +
        'wallet.referral_code ILIKE :search OR ' +
        'CAST(wallet.wallet_type AS TEXT) ILIKE :search)';
      
      if (type) {
        queryBuilder = queryBuilder.andWhere(searchCondition, { search: `%${search}%` });
      } else {
        queryBuilder = queryBuilder.where(searchCondition, { search: `%${search}%` });
      }
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

  async getReferralStatistics(walletId: number): Promise<ReferralStatisticsDto> {
    // Tìm ví theo ID
    const wallet = await this.walletRepository.findOne({ 
      where: { id: walletId },
      relations: ['user']
    });
    
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Tìm tất cả ví được giới thiệu bởi ví này
    const referredWallets = await this.walletRepository
      .createQueryBuilder('wallet')
      .leftJoin('wallet.user', 'user')
      .select([
        'wallet.id',
        'wallet.sol_address',
        'wallet.created_at',
        'user.telegram_id',
        'user.email'
      ])
      .where('wallet.referred_by = :referralCode', { referralCode: wallet.referral_code })
      .orderBy('wallet.created_at', 'DESC')
      .getMany();

    return {
      wallet_id: wallet.id,
      sol_address: wallet.sol_address,
      referral_code: wallet.referral_code,
      total_referred_wallets: referredWallets.length,
      referred_wallets: referredWallets.map(w => ({
        id: w.id,
        sol_address: w.sol_address,
        created_at: w.created_at,
        user_telegram_id: w.user?.telegram_id,
        user_email: w.user?.email
      }))
    };
  }
}

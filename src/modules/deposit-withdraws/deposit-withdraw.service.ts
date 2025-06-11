import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositWithdraw } from './deposit-withdraw.entity';

@Injectable()
export class DepositWithdrawService {
  constructor(
    @InjectRepository(DepositWithdraw)
    private depositWithdrawRepository: Repository<DepositWithdraw>,
  ) {}

  async findByWalletId(walletId: number): Promise<DepositWithdraw[]> {
    return this.depositWithdrawRepository.find({
      where: { wallet_id: walletId },
      order: { created_at: 'DESC' }
    });
  }

  // Các phương thức sẽ được thêm sau
} 
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Wallet } from '../wallets/wallet.entity';
import { SwapOrder } from '../swap-orders/swap-order.entity';

export enum RewardStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed'
}

@Entity('referral_rewards')
export class ReferralReward {
  @PrimaryGeneratedColumn()
  id: number;

  // ID của ví người giới thiệu (người nhận phần thưởng)
  @Column({ type: 'bigint' })
  referrer_wallet_id: number;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'referrer_wallet_id' })
  referrer_wallet: Wallet;

  // ID của ví được giới thiệu (người thực hiện swap)
  @Column({ type: 'bigint' })
  referred_wallet_id: number;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'referred_wallet_id' })
  referred_wallet: Wallet;

  // ID của swap order tạo ra phần thưởng
  @Column({ type: 'bigint' })
  swap_order_id: number;

  @ManyToOne(() => SwapOrder)
  @JoinColumn({ name: 'swap_order_id' })
  swap_order: SwapOrder;

  // Số lượng phần thưởng
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  reward_amount: number;

  // Loại token phần thưởng
  @Column({ type: 'varchar', length: 10, default: null })
  reward_token: string;

  // Trạng thái phần thưởng
  @Column({ 
    type: 'enum', 
    enum: RewardStatus, 
    default: RewardStatus.PENDING 
  })
  status: RewardStatus;

  // Hash transaction khi thanh toán phần thưởng
  @Column({ type: 'varchar', nullable: true })
  tx_hash: string;

  @CreateDateColumn()
  created_at: Date;
}
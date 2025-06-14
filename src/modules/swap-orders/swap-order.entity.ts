import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Wallet } from '../wallets/wallet.entity';

export enum TokenType {
  SOL = 'SOL',
  USDT = 'USDT',
  USDC = 'USDC',
  // Thêm các loại token khác nếu cần
}

export enum SwapOrderStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

@Entity('swap_orders')
export class SwapOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  wallet_id: number;

  @ManyToOne(() => Wallet, { nullable: true })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({
    type: 'enum',
    enum: TokenType,
    default: TokenType.SOL
  })
  input_token: TokenType;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  input_amount: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  mmp_received: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  swap_rate: number;

  @Column({
    type: 'enum',
    enum: SwapOrderStatus,
    default: SwapOrderStatus.PENDING
  })
  status: SwapOrderStatus;

  @Column({ type: 'varchar', nullable: true })
  tx_hash_send: string;

  @Column({ type: 'varchar', nullable: true })
  tx_hash_ref: string;

  @CreateDateColumn()
  created_at: Date;
} 
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Wallet } from '../wallets/wallet.entity';

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw'
}

export enum WithdrawalStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('deposit_withdraws')
export class DepositWithdraw {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  wallet_id: number;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({
    type: 'enum',
    enum: TransactionType
  })
  type: TransactionType;

  @Column({ type: 'varchar' })
  symbol: string;

  @Column({ type: 'varchar' })
  from_address: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fee_usd: number;

  @Column({ type: 'varchar' })
  to_address: string;

  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING
  })
  status: WithdrawalStatus;

  @Column({ type: 'varchar', nullable: true })
  tx_hash: string;

  @CreateDateColumn()
  created_at: Date;
} 
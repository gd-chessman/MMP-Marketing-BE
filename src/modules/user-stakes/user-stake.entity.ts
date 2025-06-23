import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Wallet } from '../wallets/wallet.entity';
import { StakingPlan } from '../staking-plans/staking-plan.entity';

export enum UserStakeStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

@Entity('user_stakes')
export class UserStake {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  wallet_id: number;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ type: 'int' })
  staking_plan_id: number;

  @ManyToOne(() => StakingPlan)
  @JoinColumn({ name: 'staking_plan_id' })
  staking_plan: StakingPlan;

  @Column({ type: 'bigint' })
  stake_id: number;

  @Column({ type: 'varchar' })
  stake_account_pda: string;

  @Column({ type: 'varchar', unique: true })
  staking_tx_signature: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  unstaking_tx_signature: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount_staked: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  amount_claimed: number;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({
    type: 'enum',
    enum: UserStakeStatus,
  })
  status: UserStakeStatus;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
} 
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
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

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount_staked: number;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ type: 'date', nullable: true })
  last_claimed_at: Date;

  @Column({
    type: 'enum',
    enum: UserStakeStatus,
    default: UserStakeStatus.ACTIVE
  })
  status: UserStakeStatus;

  @CreateDateColumn()
  created_at: Date;
} 
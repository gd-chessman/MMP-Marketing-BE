import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { Wallet } from '../wallets/wallet.entity';

@Entity('referral_clicks')
export class ReferralClick {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
  wallet_id: number;

  @OneToOne(() => Wallet)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ type: 'int', default: 0 })
  total_clicks: number;

  @Column({ type: 'int', default: 0 })
  clicks_today: number;

  @Column({ type: 'int', default: 0 })
  clicks_this_week: number;

  @Column({ type: 'int', default: 0 })
  clicks_this_month: number;

  @Column({ type: 'timestamp', nullable: true })
  last_click_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
} 
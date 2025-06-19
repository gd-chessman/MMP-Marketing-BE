import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, BeforeInsert, ManyToOne, JoinColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from '../users/user.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', nullable: true })
  user_id: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', unique: true })
  sol_address: string;

  @Exclude()
  @Column({ type: 'text', nullable: true })
  private_key: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance_sol: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance_usdt: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance_usdc: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance_mmp: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance_mpb: number;

  @CreateDateColumn()
  created_at: Date;
} 
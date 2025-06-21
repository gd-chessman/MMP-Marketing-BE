import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, BeforeInsert, ManyToOne, JoinColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from '../users/user.entity';

export enum WalletType {
  NORMAL = 'normal',
  BJ = 'bj'
}

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

  // Mã giới thiệu của ví này
  @Column({ type: 'varchar', length: 10, unique: true, nullable: true })
  referral_code: string;

  // Loại ví (normal/bj)
  @Column({ 
    type: 'enum', 
    enum: WalletType, 
    default: WalletType.NORMAL 
  })
  wallet_type: WalletType;

  // Mã giới thiệu của người giới thiệu ví này
  @Column({ type: 'varchar', length: 10, nullable: true })
  referred_by: string;

  @CreateDateColumn()
  created_at: Date;

  @BeforeInsert()
  generateReferralCode() {
    if (!this.referral_code && this.user_id !== null) {
      // Tạo mã 8 ký tự chữ và số
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      this.referral_code = result;
    }
  }
}
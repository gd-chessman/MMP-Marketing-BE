import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_wallets')
export class UserWallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  gg_auth: string;

  @Column({ type: 'boolean', default: false })
  isActiveMail: boolean;

  @Column({ type: 'varchar', nullable: true })
  telegram_id: string;

  @Column({ type: 'varchar' })
  sol_address: string;

  @Column({ type: 'text' })
  private_key: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance_sol: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  balance_mmp: number;

  @CreateDateColumn()
  created_at: Date;
} 
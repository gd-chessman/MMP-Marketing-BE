import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('token_sale_rounds')
export class TokenSaleRound {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  round_name: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  quantity: string;

  @Column({ type: 'varchar', length: 50 })
  coin: string;

  @Column({ type: 'timestamp' })
  time_start: Date;

  @Column({ type: 'timestamp' })
  time_end: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}

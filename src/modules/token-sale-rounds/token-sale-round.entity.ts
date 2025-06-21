import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum TokenType {
  MMP = 'MMP',
  MPB = 'MPB'
}

export enum Status {
  UPCOMING = 'upcoming',
  ONGOING = 'ongoing',
  ENDED = 'ended'
}

@Entity('token_sale_rounds')
export class TokenSaleRound {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  round_name: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  quantity: string;

  @Column({
    type: 'enum',
    enum: TokenType,
    default: TokenType.MMP
  })
  coin: TokenType;

  @Column({ type: 'timestamp' })
  time_start: Date;

  @Column({ type: 'timestamp' })
  time_end: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  get status(): Status {
    const now = new Date();
    const startTime = new Date(this.time_start);
    const endTime = new Date(this.time_end);

    if (now < startTime) {
      return Status.UPCOMING;
    } else if (now >= startTime && now <= endTime) {
      return Status.ONGOING;
    } else {
      return Status.ENDED;
    }
  }
}

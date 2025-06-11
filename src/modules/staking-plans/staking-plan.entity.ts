import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('staking_plans')
export class StakingPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'float' })
  interest_rate: number;

  @Column({ type: 'int' })
  period_days: number;

  @CreateDateColumn()
  created_at: Date;
} 
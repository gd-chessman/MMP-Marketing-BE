import { Exclude } from 'class-transformer';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, BeforeInsert } from 'typeorm';


@Entity('users')
export class User {
  @Column({ type: 'bigint', primary: true })
  id: number;

  @Column({ type: 'varchar', nullable: true })
  full_name: string;

  @Column({ type: 'varchar', nullable: true })
  email: string;

  @Column({ type: 'boolean', default: false })
  is_verified_email: boolean;

  @Column({ type: 'varchar', nullable: true })
  @Exclude()
  gg_auth: string;

  @Column({ default: false })
  is_verified_gg_auth: boolean;

  @Column({ type: 'varchar', nullable: true })
  telegram_id: string;

  @CreateDateColumn()
  created_at: Date;

  @BeforeInsert()
  generateId() {
    // Generate random number between 1000-9999
    const random = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;
    // Get current timestamp in seconds and take last 8 digits
    const timestamp = Math.floor(Date.now() / 1000).toString().slice(-8);
    // Combine random number and timestamp
    this.id = parseInt(`${random}${timestamp}`);
  }
} 
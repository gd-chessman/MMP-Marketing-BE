// src/entities/user.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Role } from '../role/role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 45 })
  username: string;

  @Column({ length: 45 })
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ length: 45, nullable: true })
  dob: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ length: 255, nullable: true })
  address: string;

  @Column({ length: 512, nullable: true })
  about: string;

  @Column()
  password: string;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ type: 'bytea', nullable: true })
  avatar: Buffer;

  @Column({ type: 'bytea', nullable: true })
  background: Buffer;

  @Column({ length: 50, nullable: true })
  avatarMimeType: string;

  @Column({ length: 50, nullable: true })
  backgroundMimeType: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

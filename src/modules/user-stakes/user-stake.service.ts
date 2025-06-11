import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStake } from './user-stake.entity';

@Injectable()
export class UserStakeService {
  constructor(
    @InjectRepository(UserStake)
    private userStakeRepository: Repository<UserStake>,
  ) {}

  // Các phương thức sẽ được thêm sau
} 
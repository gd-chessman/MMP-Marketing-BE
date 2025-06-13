import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAdmin } from './user-admins/user-admin.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserAdmin)
    private readonly userAdminRepository: Repository<UserAdmin>,
  ) {}

} 
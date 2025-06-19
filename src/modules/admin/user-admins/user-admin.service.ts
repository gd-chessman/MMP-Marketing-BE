import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAdmin } from './user-admin.entity';

@Injectable()
export class UserAdminService {
  constructor(
    @InjectRepository(UserAdmin)
    private userAdminRepository: Repository<UserAdmin>,
  ) {}

  async findById(id: number) {
    return this.userAdminRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.userAdminRepository.findOne({ where: { email } });
  }
}

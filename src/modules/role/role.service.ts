// src/roles/roles.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Role } from './role.entity';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  // Tạo mới role
  async create(role: Partial<Role>): Promise<Role> {
    return this.roleRepository.save(role);
  }

  // src/entities/role.entity.ts
  async findAll(numberLevel: number): Promise<Role[]> {
    return this.roleRepository.find({
      where: { level: MoreThan(numberLevel) }
    });
  }

  // Tìm kiếm role theo ID
  async findById(id: string): Promise<Role> {
    return this.roleRepository.findOne({
      where: { id }
    });
  }

  // Tìm kiếm role theo name
  async findByName(name: string): Promise<Role> {
    return this.roleRepository.findOne({
      where: { name }
    });
  }
}

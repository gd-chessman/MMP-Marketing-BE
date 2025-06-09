// src/modules/user/user.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcryptjs';
import { Role } from '../role/role.entity';
import { RoleService } from '../role/role.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly roleService: RoleService,
  ) {}

  // Tạo người dùng mới
  async create(user: User): Promise<User> {
    const salt = await bcrypt.genSalt(10); // Tạo salt
    user.password = await bcrypt.hash(user.password, salt); // Băm mật khẩu
    return this.userRepository.save(user); // Lưu người dùng
  }

  // Lấy tất cả người dùng
  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      relations: ['role'],
      order: { createdAt: 'DESC' }
    });
  }  

  // Lấy người dùng theo ID
  async findById(id: string): Promise<User> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['role']
    });
  }

  // Tìm người dùng theo username
  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username },
      relations: ['role']
    });
  }

  // Cập nhật thông tin người dùng
  async update(userId: string, user: User): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { id: userId }
    });
    if (user.password) {
      // Băm mật khẩu mới
      const salt = await bcrypt.genSalt(10); // Tạo salt
      user.password = await bcrypt.hash(user.password, salt); // Băm mật khẩu mới
    } else {
      // Nếu không có mật khẩu mới, giữ mật khẩu cũ
      user.password = existingUser.password;
    }
    user.role = existingUser.role;

    await this.userRepository.update(userId, user);
    return this.findById(userId);
  }

  // Phương thức lấy người dùng theo role
  async findByRole(roleName: string): Promise<User[]> {
    const role = await this.roleService.findByName(roleName); // Lấy role qua roleService
    if (!role) {
      throw new Error(`Role with name "${roleName}" not found`);
    }

    return this.userRepository.find({
      where: { role: { id: role.id } },
      relations: ['role']
    });
  }

}

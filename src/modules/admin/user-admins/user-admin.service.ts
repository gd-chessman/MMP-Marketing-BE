import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { UserAdmin, UserAdminRole } from './user-admin.entity';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { SearchUserAdminsDto } from './dto/search-user-admins.dto';
import { DeleteUserAdminDto } from './dto/delete-user-admin.dto';
import { UserAdminStatisticsDto } from './dto/user-admin-statistics.dto';
import * as bcrypt from 'bcrypt';

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

  async findAll(searchDto: SearchUserAdminsDto) {
    const { search, page = 1, limit = 10 } = searchDto;
    
    const queryBuilder = this.userAdminRepository.createQueryBuilder('user_admin');

    // Add search filter
    if (search) {
      queryBuilder.andWhere(
        '(user_admin.full_name LIKE :search OR user_admin.email LIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Add pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Add ordering
    queryBuilder.orderBy('user_admin.created_at', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(createUserAdminDto: CreateUserAdminDto, currentUser: any) {
    // Kiểm tra quyền Admin
    if (currentUser.role !== UserAdminRole.ADMIN) {
      throw new ForbiddenException('Only Admin can perform this action');
    }

    // Check if email already exists
    const existingUser = await this.findByEmail(createUserAdminDto.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserAdminDto.password, 10);

    // Create new user admin
    const newUserAdmin = this.userAdminRepository.create({
      ...createUserAdminDto,
      password: hashedPassword,
    });

    return this.userAdminRepository.save(newUserAdmin);
  }

  async delete(deleteUserAdminDto: DeleteUserAdminDto, currentUser: any) {
    // Kiểm tra quyền Admin
    if (currentUser.role !== UserAdminRole.ADMIN) {
      throw new ForbiddenException('Only Admin can perform this action');
    }

    // Không thể xóa chính mình
    if (currentUser.id === deleteUserAdminDto.id) {
      throw new ForbiddenException('Cannot delete yourself');
    }

    // Kiểm tra user admin tồn tại
    const userAdmin = await this.findById(deleteUserAdminDto.id);
    if (!userAdmin) {
      throw new NotFoundException('User admin not found');
    }

    // Xóa user admin
    await this.userAdminRepository.remove(userAdmin);

    return {
      message: 'User admin deleted successfully',
    };
  }

  async getStatistics(): Promise<UserAdminStatisticsDto> {
    // Tổng số user admin trong hệ thống
    const totalUsers = await this.userAdminRepository.count();

    // Số user admin có role ADMIN
    const adminUsers = await this.userAdminRepository.count({
      where: { role: UserAdminRole.ADMIN }
    });

    // Số user admin có role MEMBER
    const memberUsers = await this.userAdminRepository.count({
      where: { role: UserAdminRole.MEMBER }
    });

    return {
      total_users: totalUsers,
      admin_users: adminUsers,
      member_users: memberUsers
    };
  }
}

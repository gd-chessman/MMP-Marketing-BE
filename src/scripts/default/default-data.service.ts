import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';  // Import bcryptjs
import { User } from '../../modules/user/user.entity';
import { Setting } from '../../modules/setting/setting.entity';
import { RoleService } from 'src/modules/role/role.service';
import { DEFAULT_ADMIN_USER, DEFAULT_ROLES, DEFAULT_SETTING } from 'src/shared/constants';

@Injectable()
export class DefaultDataService implements OnModuleInit {
  constructor(
    private readonly roleService: RoleService,  // Inject RoleService
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  async onModuleInit() {
    await this.createDefaultRoles();
    await this.createAdminUser();
    await this.createDefaultSetting();
  }

  // Tạo các vai trò mặc định
  private async createDefaultRoles() {
    for (const roleData of DEFAULT_ROLES) {
      const existingRole = await this.roleService.findByName(roleData.name);
      if (!existingRole) {
        await this.roleService.create(roleData);
        console.log(`Role ${roleData.name} created.`);
      }
    }
  }

  // Tạo người dùng admin mặc định
  private async createAdminUser() {
    const existingUser = await this.userRepository.findOne({
      where: { username: DEFAULT_ADMIN_USER.username }
    });
    
    if (!existingUser) {
      const adminRole = await this.roleService.findByName('ROLE_ADMIN');
      const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_USER.password, 10);  // Mã hóa mật khẩu

      const adminUser = this.userRepository.create({
        ...DEFAULT_ADMIN_USER,
        password: hashedPassword,  // Lưu mật khẩu đã mã hóa
        role: adminRole
      });

      await this.userRepository.save(adminUser);
      console.log('Admin user created with username: admin');
    }
  }

  // Tạo cấu hình mặc định cho ứng dụng
  private async createDefaultSetting() {
    const existingSetting = await this.settingRepository.findOne({
      where: {}
    });
    
    if (!existingSetting) {
      const defaultSetting = this.settingRepository.create(DEFAULT_SETTING);
      await this.settingRepository.save(defaultSetting);
      console.log('Default setting created.');
    } else {
      console.log('Default setting already exists.');
    }
  }
}
